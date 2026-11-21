/**
 * SETUP – Mẫu LBG của trường (KHUNG lịch báo giảng).
 * Mỗi TKB chọn 1 mẫu; bảng TKB, bảng LBG mẫu, LBG của tôi và file xuất đều dựng theo khung này.
 * (Khác với "Bảng LBG mẫu" ở màn Tạo LBG – đó là DỮ LIỆU LBG của tổ trưởng / lãnh đạo.)
 *
 * Thêm trường mới: thêm 1 phần tử vào LBG_TEMPLATES.
 *  - columns : thứ tự & tên cột. key cố định: day | session | tiet | ppct | mon | tenBai | ddhd
 *              (bỏ cột "session" nếu trường không chia buổi)
 *  - days    : các ngày trong tuần; periods = số tiết; morning = số tiết đầu thuộc buổi Sáng
 */
const LBG_TEMPLATES = [
  {
    id: "th-dong-hoi",
    name: "Mẫu LBG Tiểu học Đông Hội",
    columns: [
      { key: "day", label: "Thứ/ ngày" },
      { key: "session", label: "Buổi học" },
      { key: "tiet", label: "Tiết" },
      { key: "ppct", label: "Tiết theo PPCT" },
      { key: "mon", label: "Môn" },
      { key: "tenBai", label: "Tên bài" },
      { key: "ddhd", label: "ĐDDH" },
    ],
    sessions: { morning: "Sáng", afternoon: "Chiều" },
    days: [
      { key: "HAI", label: "HAI", periods: 8, morning: 5 },
      { key: "BA", label: "BA", periods: 7, morning: 4 },
      { key: "TU", label: "TƯ", periods: 7, morning: 4 },
      { key: "NAM", label: "NĂM", periods: 7, morning: 4 },
      { key: "SAU", label: "SÁU", periods: 7, morning: 4 },
    ],
  },
];

const DEFAULT_TEMPLATE_ID = LBG_TEMPLATES[0].id;

/** Lấy mẫu theo id (không có / không tìm thấy -> mẫu mặc định) */
function getTemplate(id) {
  return LBG_TEMPLATES.find((t) => t.id === id) || LBG_TEMPLATES[0];
}
/** Mẫu của 1 TKB (TKB cũ chưa có templateId -> mẫu mặc định) */
function templateOf(tkb) {
  return getTemplate(tkb && tkb.templateId);
}

/** Buổi của tiết thứ ri (0-based) trong ngày */
function sessionOfRow(tpl, dayTpl, ri) {
  const s = tpl.sessions || { morning: "Sáng", afternoon: "Chiều" };
  return dayTpl && ri >= (dayTpl.morning ?? Infinity) ? s.afternoon : s.morning;
}

/**
 * Ô "Buổi học" gộp dòng: trả về { label, rowspan } nếu ô bắt đầu ở dòng ri, ngược lại null.
 * n = số dòng của ngày.
 */
function sessionSpan(tpl, dayTpl, ri, n) {
  const m = Math.min(dayTpl?.morning ?? n, n);
  const s = tpl.sessions || { morning: "Sáng", afternoon: "Chiều" };
  if (ri === 0) return { label: m > 0 ? s.morning : s.afternoon, rowspan: m > 0 ? m : n, start: false };
  if (ri === m && n > m) return { label: s.afternoon, rowspan: n - m, start: true };
  return null;
}

/** Dòng tiêu đề bảng theo mẫu */
function tableHeadHtml(tpl) {
  return `<tr>${tpl.columns.map((c) => `<th class="col-${c.key}">${escapeHtml(c.label)}</th>`).join("")}</tr>`;
}
