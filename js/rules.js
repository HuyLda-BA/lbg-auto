/**
 * RULE QUY ĐỔI LỊCH BÁO GIẢNG (code hóa từ "Rule quy đổi lịch báo giảng.md").
 * File tổ trưởng (TT) là GỐC: không sửa, không chuẩn hóa nội dung lấy từ TT.
 *
 * Đầu vào:
 *   gvDays : [{ label: "HAI", periods: [{ tiet, mon }] }]          – TKB của tôi (cột Môn)
 *   tt     : { week, from, to, days: [{ label, rows: [{ ppct, mon, tenBai, ddhd }] }],
 *              footer: { d, m, y } }                                 – LBG tổ trưởng
 *   sign   : { place, role, leader }                                 – lấy từ TKB của tôi
 * Đầu ra:
 *   { title, range, days: [{ label, rows: [{ tiet, mon, ppct, tenBai, ddhd, status }] }],
 *     footer: { dateLine, role, leader }, report }
 *   report = { notExist: [...], over: [...], leftover: [...] }
 *     mỗi mục: { di, ri, text } – di/ri = vị trí ngày / tiết (để tô đỏ & nhảy tới dòng)
 *     over thêm overBy = số tiết thừa của môn
 *     notExist, over : vị trí ở bảng LBG của tôi
 *     leftover       : vị trí ở bảng LBG mẫu
 */
const LbgRules = (() => {
  const NOT_EXIST = "Không tồn tại ở LBG Mẫu";   // Rule 3.2
  const OVER = "Thừa tiết so với LBG Mẫu";       // Rule 3.4

  /**
   * Rule 1 – So khớp tên môn: bỏ qua khoảng trắng (đầu, cuối, giữa) và không phân biệt hoa/thường.
   * Dùng chung hàm normName() (common.js) – chỉ để so sánh, không sửa nội dung hiển thị.
   */
  const normSubject = normName;

  const has = (s) => String(s ?? "").trim() !== "";

  function generate({ gvDays, tt, sign }) {
    /* ---- Rule 2.1: hàng đợi theo môn, duyệt TT theo thời gian cả tuần ---- */
    const queues = new Map();   // môn chuẩn hóa -> [{ppct, tenBai, ddhd, src}]
    const ttCount = new Map();
    tt.days.forEach((day, di) => {
      day.rows.forEach((r, ri) => {
        if (!has(r.mon)) return;
        const k = normSubject(r.mon);
        if (!queues.has(k)) { queues.set(k, []); ttCount.set(k, 0); }
        queues.get(k).push({
          ppct: r.ppct ?? "", tenBai: r.tenBai ?? "", ddhd: r.ddhd ?? "", mon: r.mon,
          di, ri, where: `${day.label} – tiết ${ri + 1}`,
        });
        ttCount.set(k, ttCount.get(k) + 1);
      });
    });

    // Số tiết từng môn bên GV (để tính k của Rule 3.4)
    const gvCount = new Map();
    gvDays.forEach((d) => d.periods.forEach((p) => {
      if (!has(p.mon)) return;
      const k = normSubject(p.mon);
      gvCount.set(k, (gvCount.get(k) || 0) + 1);
    }));

    const report = { notExist: [], over: [], leftover: [] };

    /* ---- Rule 2.2 + Rule 3: duyệt GV theo thời gian, điền từng dòng ---- */
    const days = gvDays.map((d, di) => {
      // Rule 4: Ngày thứ chép nguyên từ TT (theo thứ tự ngày)
      const label = tt.days[di] && has(tt.days[di].label) ? tt.days[di].label : d.label;
      const rows = d.periods.map((p, pi) => {
        // Rule 4: Tiết theo TKB đánh số 1 → n trong từng ngày
        const row = { tiet: pi + 1, mon: p.mon, ppct: "", tenBai: "", ddhd: "", status: "empty" };
        if (!has(p.mon)) return row;                                  // 3.1

        const k = normSubject(p.mon);
        const where = `${label} – tiết ${pi + 1} – ${p.mon}`;
        if (!queues.has(k)) {                                         // 3.2
          row.tenBai = NOT_EXIST;
          row.status = "notExist";
          report.notExist.push({ di, ri: pi, text: where });
          return row;
        }
        const q = queues.get(k);
        if (q.length) {                                               // 3.3 chép nguyên văn
          const it = q.shift();
          row.ppct = it.ppct;
          row.tenBai = it.tenBai;
          row.ddhd = it.ddhd;
          row.status = "ok";
          return row;
        }
        const over = gvCount.get(k) - ttCount.get(k);                 // 3.4
        row.tenBai = OVER;
        row.status = "over";
        report.over.push({ di, ri: pi, text: where, overBy: over });
        return row;
      });
      return { label, rows };
    });

    /* ---- Rule 5: bài chưa khớp ở LBG mẫu (còn lại trong hàng đợi) ---- */
    queues.forEach((q) => q.forEach((it) => {
      report.leftover.push({ di: it.di, ri: it.ri, text: `${it.where} – ${it.mon}: ${it.tenBai || "(không có tên bài)"}` });
    }));
    report.leftover.sort((a, b) => a.di - b.di || a.ri - b.ri);

    /* ---- Rule 4: các trường còn lại ---- */
    const f = tt.footer || {};
    return {
      title: `TUẦN ${String(tt.week).trim()}`,
      range: `(Từ ngày ${fmtRangeDate(tt.from)} đến ngày ${fmtRangeDate(tt.to)})`,
      days,
      footer: {
        dateLine: dateLine(sign.place, f.d, f.m, f.y),
        role: sign.role || "",
        leader: sign.leader || "",
      },
      report,
    };
  }

  /** "Đông Hội, ngày 4 tháng 9 năm 2026" – không có nơi chốn thì "Ngày 4 tháng 9 năm 2026" */
  function dateLine(place, d, m, y) {
    const p = String(place ?? "").trim();
    return p ? `${p}, ngày ${d} tháng ${m} năm ${y}` : `Ngày ${d} tháng ${m} năm ${y}`;
  }

  return { generate, normSubject, dateLine, NOT_EXIST, OVER };
})();
