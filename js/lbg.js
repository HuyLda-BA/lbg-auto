/**
 * US2 – Tạo lịch báo giảng cho tôi (process 4 bước).
 *  B1: Chọn TKB (tự chọn TKB mới nhất)
 *  B2: Nhập LBG mẫu (nhập / dán Excel)
 *  B3: Gen LBG của tôi -> chạy LbgRules (rules.js)
 *  B4: Chỉnh sửa & Xuất file (Copy / In)
 *  Cột Môn ở bảng "LBG của tôi" sửa được -> nút "Lưu TKB" cập nhật lại TKB.
 */
const TT_FIELDS = ["ppct", "mon", "tenBai", "ddhd"]; // thứ tự cột dán Excel: PPCT -> ĐDDH

const Lbg = {
  tkbId: null,
  tpl: null,         // Mẫu LBG của trường (khung) – theo TKB đang chọn
  tt: null,          // dữ liệu LBG mẫu (của tổ trưởng / lãnh đạo)
  gvDays: null,      // bản sao cột Môn của TKB đang chọn (có thể đã sửa, chưa lưu)
  sign: null,        // bản sao thông tin ký của TKB {place, role, leader} (có thể đã sửa, chưa lưu)
  result: null,
  resultEdited: false,
  ttDirty: false,    // LBG mẫu đã nhập (chưa lưu đâu cả)
  tkbDirty: false,   // cột Môn / thông tin ký đã sửa ở bảng LBG của tôi, chưa lưu vào TKB
  stale: false,      // cột Môn đổi sau khi Gen -> cần Gen lại
  exported: false,   // đã Copy / In
};

function emptyTtRow() { return { ppct: "", mon: "", tenBai: "", ddhd: "" }; }

function emptyTt(tpl = Lbg.tpl || getTemplate()) {
  return {
    templateId: tpl.id,
    week: "", from: "", to: "",
    days: tpl.days.map((d) => ({
      base: d.label, label: d.label,
      rows: Array.from({ length: d.periods }, emptyTtRow),
    })),
    footer: { d: "", m: "", y: "" },
  };
}

const currentTkb = () => (Lbg.tkbId ? TkbStorage.get(Lbg.tkbId) : null);
const signOf = (tkb) => (tkb && tkb.footer) || {};
const syncDirty = () => { App.dirty = Lbg.ttDirty || Lbg.tkbDirty; };

function loadGvDays() {
  const tkb = currentTkb();
  Lbg.tpl = templateOf(tkb);
  Lbg.gvDays = mergeWithTemplate(tkb ? tkb.days : [], Lbg.tpl);
  const s = signOf(tkb);
  Lbg.sign = { place: s.place || "", role: s.role || "", leader: s.leader || "" };
  Lbg.tkbDirty = false;
}

/** Thông tin ký đang dùng ở màn LBG (bản đang sửa, đã trim) */
const curSign = () => {
  const s = Lbg.sign || {};
  return { place: String(s.place || "").trim(), role: String(s.role || "").trim(), leader: String(s.leader || "").trim() };
};

/** Ô "Buổi học" (gộp dòng) cho dòng ri của ngày di; "" nếu dòng nằm trong ô đã gộp */
function sessionTd(di, ri, n, cls = "") {
  const s = sessionSpan(Lbg.tpl, Lbg.tpl.days[di], ri, n);
  return s ? `<td class="session locked ${cls}" rowspan="${s.rowspan}">${escapeHtml(s.label)}</td>` : "";
}
function rowClass(di, ri, n) {
  const s = sessionSpan(Lbg.tpl, Lbg.tpl.days[di], ri, n);
  return [ri === 0 ? "day-start" : "", s && s.start ? "ses-start" : ""].join(" ").trim();
}

/* ================= Màn hình chính (duy nhất) ================= */
/** Hiện trạng thái "chưa có TKB" hoặc khu làm việc */
function showLbgEmpty(empty) {
  $("#lbgEmpty").classList.toggle("hidden", !empty);
  $("#lbgMain").classList.toggle("hidden", empty);
}

/** Dựng lại danh sách TKB ở Bước 1, giữ TKB đang chọn */
function refreshTkbOptions() {
  const list = TkbStorage.list();
  $("#lbgTkbSelect").innerHTML = list.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("");
  if (Lbg.tkbId) $("#lbgTkbSelect").value = Lbg.tkbId;
  return list;
}

/** Khởi tạo khu làm việc (lúc mở trang, hoặc khi vừa tạo TKB đầu tiên) */
function openLbg(tkbId) {
  const list = TkbStorage.list();
  showLbgEmpty(list.length === 0);
  if (!list.length) { Lbg.tkbId = null; Lbg.tt = null; Lbg.result = null; return; }

  // B1: tự chọn TKB mới nhất (danh sách đã sắp xếp mới nhất lên đầu)
  Lbg.tkbId = tkbId && TkbStorage.get(tkbId) ? tkbId : list[0].id;
  refreshTkbOptions();

  loadGvDays();
  Lbg.tt = emptyTt();
  Lbg.result = null;
  Object.assign(Lbg, { resultEdited: false, ttDirty: false, stale: false, exported: false });
  syncDirty();
  renderTt();
  renderResult();
  updateGenState();
}

/**
 * Chọn TKB ở Bước 1 (từ dropdown, popup Quản lý TKB, hoặc sau khi tạo TKB mới).
 * Hỏi xác nhận nếu sẽ mất dữ liệu. Trả về true nếu đã chuyển.
 */
async function selectTkb(id, { silent = false } = {}) {
  if (!id || !TkbStorage.get(id)) return false;
  if (!Lbg.tt) { openLbg(id); return true; }        // khu làm việc chưa khởi tạo
  if (id === Lbg.tkbId) { $("#lbgTkbSelect").value = id; return true; }

  // TKB mới dùng Mẫu LBG (khung) khác -> bảng LBG mẫu phải dựng lại theo khung mới
  const tplChanged = templateOf(TkbStorage.get(id)).id !== Lbg.tpl.id;
  if (!silent && (Lbg.result || Lbg.tkbDirty || (tplChanged && Lbg.ttDirty))) {
    const lines = [];
    if (Lbg.tkbDirty) lines.push("Các thay đổi <b>chưa lưu</b> ở bảng LBG của tôi (cột Môn / thông tin ký) sẽ bị mất.");
    if (Lbg.result) lines.push("Kết quả LBG hiện tại sẽ bị xóa.");
    lines.push(tplChanged
      ? "TKB này dùng <b>Mẫu LBG của trường khác</b> – dữ liệu LBG mẫu đã nhập <b>sẽ bị xóa</b>."
      : "Dữ liệu LBG mẫu vẫn được giữ.");
    const ok = await modal({ title: "Đổi TKB đang dùng?", html: lines.join("<br/>"), okText: "Đổi TKB", danger: tplChanged });
    if (!ok) return false;
  }
  Lbg.tkbId = id;
  $("#lbgTkbSelect").value = id;
  loadGvDays();
  Lbg.result = null;
  Object.assign(Lbg, { resultEdited: false, stale: false, exported: false });
  if (tplChanged) { Lbg.tt = emptyTt(Lbg.tpl); Lbg.ttDirty = false; renderTt(); }
  syncDirty();
  renderTtSign();
  renderResult();
  updateGenState();
  return true;
}

/**
 * Thay đổi chưa lưu ở bảng "LBG của tôi" (cột Môn + thông tin ký) của TKB đang dùng,
 * để form Sửa TKB lấy đúng. Không có -> null.
 */
function lbgPending(tkbId) {
  return Lbg.tkbDirty && tkbId === Lbg.tkbId
    ? { days: Lbg.gvDays.map((d) => ({ ...d, periods: d.periods.map((p) => ({ ...p })) })), sign: curSign() }
    : null;
}

/** Sau khi lưu TKB trong popup */
async function onTkbSaved(saved, isNew) {
  if (!Lbg.tt) { openLbg(saved.id); return; }        // TKB đầu tiên -> khởi tạo khu làm việc
  refreshTkbOptions();
  if (saved.id === Lbg.tkbId) {
    // Sửa đúng TKB đang dùng -> cập nhật cột Môn, chữ ký; nếu đã Gen thì đánh dấu cần Gen lại
    const tplChanged = templateOf(saved).id !== Lbg.tpl.id;
    loadGvDays();
    if (tplChanged) {
      Lbg.tt = emptyTt(Lbg.tpl); Lbg.ttDirty = false; Lbg.result = null; renderTt();
      toast("TKB đổi Mẫu LBG của trường – bảng LBG mẫu được dựng lại theo khung mới.", "success");
    } else if (Lbg.result) {
      // Cột Môn đổi -> cần Gen lại (tên bài phụ thuộc môn)
      let changed = false;
      Lbg.result.days.forEach((d, di) => d.rows.forEach((r, ri) => {
        const mon = Lbg.gvDays[di].periods[ri].mon;
        if (String(r.mon).trim() !== String(mon).trim()) { r.mon = mon; changed = true; }
      }));
      if (changed) Lbg.stale = true;
      // Thông tin ký đổi -> cập nhật thẳng vào kết quả, không cần Gen lại
      applySignToResult();
    }
    syncDirty();
    renderTtSign();
    renderResult();
    updateGenState();
  } else if (isNew) {
    await selectTkb(saved.id);                          // TKB vừa tạo -> chọn luôn ở Bước 1
  }
  renderList();
}

/** Sau khi xóa TKB trong popup */
async function onTkbDeleted(id) {
  const list = refreshTkbOptions();
  if (!list.length) { Object.assign(Lbg, { ttDirty: false, tkbDirty: false }); openLbg(null); syncDirty(); return; }
  if (id === Lbg.tkbId) {
    Lbg.tkbId = null;
    await selectTkb(list[0].id, { silent: true });
  }
}

/* ================= Bảng LBG mẫu ================= */
function renderTt() {
  const tt = Lbg.tt;
  $("#ttWeek").value = tt.week;
  setDateField("ttFrom", tt.from);
  setDateField("ttTo", tt.to);
  $("#ttFd").value = tt.footer.d;
  $("#ttFm").value = tt.footer.m;
  $("#ttFy").value = tt.footer.y;
  renderTtSign();
  renderTtBody();
}

function renderTtSign() {
  const s = curSign();
  const show = (id, v, ph) => {
    const el = $(id);
    el.textContent = v || ph;
    el.classList.toggle("missing", !v);
    el.title = "Lấy từ TKB của tôi – sửa ở cuối bảng LBG của tôi – không bắt buộc";
  };
  show("#ttPlace", s.place, "(chưa có nơi chốn)");
  show("#ttRole", s.role, "(chưa có chức vụ lãnh đạo)");
  show("#ttLeader", s.leader, "(chưa có tên lãnh đạo)");
}

/** Ghi thông tin ký đang sửa vào kết quả đã Gen (không cần Gen lại) */
function applySignToResult() {
  if (!Lbg.result) return;
  const s = curSign(), f = Lbg.result.footer, d = f.date || {};
  f.dateLine = LbgRules.dateLine(s.place, d.d, d.m, d.y);
  f.role = s.role;
  f.leader = s.leader;
}

function renderTtBody() {
  const tpl = Lbg.tpl;
  $("#ttHead").innerHTML = tableHeadHtml(tpl);
  const rows = [];
  let flat = 0;
  Lbg.tt.days.forEach((day, di) => {
    const n = day.rows.length;
    day.rows.forEach((r, ri) => {
      const field = (f) => {
        const ci = TT_FIELDS.indexOf(f);
        const attrs = `data-flat="${flat}" data-col="${ci}" data-dayi="${di}" data-rowi="${ri}" data-field="${f}"`;
        if (f === "tenBai") {
          return `<td class="editable"><textarea class="auto" rows="1" ${attrs}>${escapeHtml(r[f])}</textarea></td>`;
        }
        return `<td class="editable${f === "ppct" ? " ppct" : ""}"><input ${attrs} value="${escapeHtml(r[f])}" autocomplete="off" /></td>`;
      };
      const cell = {
        day: () => (ri === 0
          ? `<td class="day editable-day" rowspan="${n}">
               <input class="day-input" data-dayi="${di}" value="${escapeHtml(day.label)}" placeholder="${escapeHtml(day.base)}" />
             </td>`
          : ""),
        session: () => sessionTd(di, ri, n),
        tiet: () => `<td class="period locked">${ri + 1}</td>`,
        ppct: () => field("ppct"), mon: () => field("mon"), tenBai: () => field("tenBai"), ddhd: () => field("ddhd"),
      };
      rows.push(`<tr class="${rowClass(di, ri, n)}" data-day="${di}">${tpl.columns.map((c) => (cell[c.key] ? cell[c.key]() : "<td></td>")).join("")}</tr>`);
      flat++;
    });
  });
  $("#ttBody").innerHTML = rows.join("");
  autoSizeAll($("#ttBody"));
  markLeftoverRows();
  markRequired();
  scheduleSync();
}

/** Tự điền cột Ngày thứ theo tuần của "Từ ngày" */
function fillDayLabels() {
  const from = parseISODate(Lbg.tt.from);
  if (!from) return;
  const mon = mondayOf(from);
  Lbg.tt.days.forEach((d, i) => { d.label = fmtDayLabel(d.base, addDays(mon, i)); });
  $$("#ttBody .day-input").forEach((inp) => { inp.value = Lbg.tt.days[+inp.dataset.dayi].label; flashCell(inp); });
}

/* ---------- Ô ngày dd/mm/yyyy (+ nút chọn trên lịch) ---------- */
/** Ghi ngày (ISO) vào ô text dd/mm/yyyy và ô lịch ẩn */
function setDateField(id, iso) {
  const inp = $("#" + id);
  inp.value = fmtDMY(iso);
  inp.classList.remove("invalid");
  const picker = $(`.date-picker[data-for="${id}"]`);
  if (picker) picker.value = iso || "";
}

/** Đọc ô text -> ISO. Sai định dạng: đánh dấu đỏ, trả về "" */
function readDateField(id) {
  const inp = $("#" + id);
  const iso = parseDMY(inp.value);
  const bad = iso === null;
  inp.classList.toggle("invalid", bad);
  if (bad) return "";
  setDateField(id, iso); // chuẩn hóa hiển thị: 7/9/2026 -> 07/09/2026
  return iso;
}

/** Tự chèn "/" khi gõ số: 07 -> 07/, 07/09 -> 07/09/ */
function maskDateInput(e) {
  const inp = e.target;
  if (e.inputType && !e.inputType.startsWith("insert")) return;
  const v = inp.value;
  if (/^\d{2}$/.test(v) || /^\d{1,2}\/\d{2}$/.test(v)) inp.value = v + "/";
  else if (/^\d{8}$/.test(v)) inp.value = `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}`;
}

function openDatePicker(id) {
  const picker = $(`.date-picker[data-for="${id}"]`);
  if (!picker) return;
  try {
    if (picker.showPicker) picker.showPicker();
    else { picker.focus(); picker.click(); }
  } catch { picker.focus(); picker.click(); }
}

function onFromChange() {
  Lbg.tt.from = readDateField("ttFrom");
  if ($("#ttFrom").classList.contains("invalid")) toast("Từ ngày sai định dạng – nhập theo dd/mm/yyyy (VD: 07/09/2026).", "error");
  const from = parseISODate(Lbg.tt.from);
  if (from) {
    // Đến ngày = Thứ Sáu cùng tuần; ngày ký = Thứ Sáu tuần trước (như file mẫu) – đều sửa được
    const fri = addDays(mondayOf(from), 4);
    Lbg.tt.to = toISO(fri < from ? from : fri);
    setDateField("ttTo", Lbg.tt.to);
    const sign = addDays(mondayOf(from), -3);
    Lbg.tt.footer = { d: pad2(sign.getDate()), m: String(sign.getMonth() + 1), y: String(sign.getFullYear()) };
    $("#ttFd").value = Lbg.tt.footer.d;
    $("#ttFm").value = Lbg.tt.footer.m;
    $("#ttFy").value = Lbg.tt.footer.y;
    fillDayLabels();
    toast("Đã tự điền Đến ngày, cột Ngày thứ và ngày ký (có thể sửa lại).", "success");
  }
  markTtDirty();
}

function onToChange() {
  Lbg.tt.to = readDateField("ttTo");
  if ($("#ttTo").classList.contains("invalid")) toast("Đến ngày sai định dạng – nhập theo dd/mm/yyyy.", "error");
  fillDayLabels();
  markTtDirty();
}

function markTtDirty() {
  Lbg.ttDirty = true;
  syncDirty();
  updateGenState();
}

/* ---------- Dán Excel vào bảng LBG mẫu (PPCT -> ĐDDH) ---------- */
function handleTtPaste(e) {
  const el = e.target;
  if (el.dataset.flat === undefined) return;
  const grid = readClipboardGrid(e);
  if (!grid) return;
  e.preventDefault();

  const flatRows = Lbg.tt.days.flatMap((d, di) => d.rows.map((_, ri) => ({ di, ri })));
  const startRow = +el.dataset.flat;
  const startCol = +el.dataset.col;
  let pastedRows = 0, skippedRows = 0, skippedCols = 0;

  grid.forEach((line, gi) => {
    const pos = flatRows[startRow + gi];
    if (!pos) { skippedRows++; return; }
    pastedRows++;
    line.forEach((val, gj) => {
      const c = startCol + gj;
      if (c >= TT_FIELDS.length) { if (gi === 0) skippedCols++; return; }
      Lbg.tt.days[pos.di].rows[pos.ri][TT_FIELDS[c]] = val;
    });
  });

  renderTtBody();
  const maxCol = Math.min(TT_FIELDS.length, startCol + grid[0].length);
  $$("#ttBody [data-flat]").forEach((x) => {
    const r = +x.dataset.flat, c = +x.dataset.col;
    if (r >= startRow && r < startRow + pastedRows && c >= startCol && c < maxCol) flashCell(x);
  });

  let msg = `Đã dán ${pastedRows} dòng × ${maxCol - startCol} cột.`;
  if (skippedRows) msg += ` Bỏ qua ${skippedRows} dòng thừa (hết bảng).`;
  if (skippedCols) msg += ` Bỏ qua ${skippedCols} cột thừa (chỉ nhận PPCT → ĐDDH).`;
  markTtDirty();
  // Nhắc ngay các ô bắt buộc còn thiếu (Số tuần, Từ ngày…) – đã viền đỏ phía trên bảng
  const stillMissing = missingTtFields().filter((m) => !m.label.startsWith("Dữ liệu LBG mẫu"));
  if (stillMissing.length) {
    msg += ` ${missingMessage(stillMissing)} – ô viền đỏ phía trên bảng.`;
    toast(msg, "warn", 7000);
  } else {
    toast(msg, skippedRows || skippedCols ? "error" : "success");
  }
}

async function clearTt() {
  const ok = await modal({
    title: "Xóa LBG mẫu",
    html: "Xóa toàn bộ dữ liệu đã nhập ở bảng <b>LBG mẫu</b>?",
    okText: "Xóa", danger: true,
  });
  if (!ok) return;
  Lbg.tt = emptyTt();
  renderTt();
  markTtDirty();
}

/* ================= Kiểm tra đủ thông tin ================= */
function missingTkb() {
  // Thông tin ký (Nơi chốn / Chức vụ / Tên lãnh đạo) không bắt buộc -> chỉ cần đã chọn TKB
  return currentTkb() ? [] : ["Chọn TKB"];
}

/** Ghi chú Bước 1: nhắc nhẹ (không chặn) nếu TKB chưa có thông tin ký */
function step1Info() {
  const s = curSign();
  const miss = SIGN_FIELDS.filter((f) => !s[f.key]).map((f) => f.label.toLowerCase());
  return miss.length
    ? `${okNote("Đã chọn TKB")}<br/><span class="muted">Chưa có ${miss.join(", ")} – không bắt buộc (nhập ở cuối bảng LBG của tôi)</span>`
    : okNote("Đã chọn TKB, đủ thông tin ký");
}

/**
 * Các mục còn thiếu ở LBG mẫu: [{ label, el }]
 * el = ô cần nhập, để khi bấm Gen hệ thống dẫn người dùng tới đúng chỗ.
 */
function missingTtFields() {
  const miss = [];
  // auto = ô sẽ TỰ ĐIỀN khi nhập Từ ngày (không cần nhắc người dùng nhập tay)
  const add = (label, el, auto = false) => miss.push({ label, el, auto });
  const tt = Lbg.tt;
  const noFrom = !tt.from;
  if (!String(tt.week).trim()) add("Số tuần", $("#ttWeek"));
  if ($("#ttFrom").classList.contains("invalid")) add("Từ ngày sai định dạng dd/mm/yyyy", $("#ttFrom"));
  else if (!tt.from) add("Từ ngày", $("#ttFrom"));
  if ($("#ttTo").classList.contains("invalid")) add("Đến ngày sai định dạng dd/mm/yyyy", $("#ttTo"));
  else if (!tt.to) add("Đến ngày", $("#ttTo"), noFrom);
  if (tt.from && tt.to && tt.to < tt.from) add("Đến ngày phải ≥ Từ ngày", $("#ttTo"));
  if (tt.days.some((d) => !d.label.trim())) add("Cột Ngày thứ còn trống", $$("#ttBody .day-input").find((i) => !i.value.trim()));
  if (!tt.footer.d.trim() || !tt.footer.m.trim() || !tt.footer.y.trim()) {
    add("Ngày / tháng / năm ký", ["#ttFd", "#ttFm", "#ttFy"].map((s) => $(s)).find((i) => !i.value.trim()), noFrom);
  }
  if (!tt.days.some((d) => d.rows.some((r) => r.mon.trim()))) {
    add("Dữ liệu LBG mẫu (chưa có môn nào)", $('#ttBody [data-field="ppct"]'));
  }
  return miss;
}
const missingTt = () => missingTtFields().map((m) => m.label);

/** Câu nhắc các ô cần nhập tay (không liệt kê các ô tự điền theo Từ ngày) */
function missingMessage(fields) {
  return `Còn thiếu: ${fields.filter((m) => !m.auto).map((m) => m.label).join(", ")}`;
}

const getMissing = () => [...missingTkb(), ...missingTt()];

/**
 * Bấm Gen khi còn thiếu thông tin: báo các mục thiếu, cuộn tới ô thiếu đầu tiên,
 * nháy viền đỏ và đặt con trỏ vào đó.
 */
function guideToMissing() {
  const miss = [
    ...(currentTkb() ? [] : [{ label: "Chọn TKB", el: $("#lbgTkbSelect") }]),
    ...missingTtFields(),
  ];
  toast(`${missingMessage(miss)}. Hãy nhập ô viền đỏ rồi bấm Gen lại.`, "warn", 7000);
  const first = miss.find((m) => m.el && !m.auto);
  if (!first) return;
  const target = first.el.closest(".date-field") || first.el;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  $$(".need-flash").forEach((e) => e.classList.remove("need-flash"));
  void target.offsetWidth;
  target.classList.add("need-flash");
  target.addEventListener("animationend", () => target.classList.remove("need-flash"), { once: true });
  setTimeout(() => first.el.focus({ preventScroll: true }), 400);
}

/** Đánh dấu (viền đỏ nét đứt + nhãn "bắt buộc") các ô bắt buộc còn trống ở LBG mẫu */
function markRequired() {
  const tt = Lbg.tt;
  if (!tt) return;
  const set = (el, on) => el && el.classList.toggle("req-empty", !!on);
  const weekEmpty = !String(tt.week).trim();
  const fromEmpty = !tt.from && !$("#ttFrom").classList.contains("invalid");
  // Đến ngày & ngày ký tự điền theo Từ ngày -> chỉ đánh dấu khi đã có Từ ngày mà vẫn trống
  const toEmpty = !!tt.from && !tt.to && !$("#ttTo").classList.contains("invalid");
  set($("#ttWeek"), weekEmpty);
  set($("#ttFrom").closest(".date-field"), fromEmpty);
  set($("#ttTo").closest(".date-field"), toEmpty);
  ["#ttFd", "#ttFm", "#ttFy"].forEach((s) => set($(s), !!tt.from && !$(s).value.trim()));
  $$("#ttBody .day-input").forEach((i) => set(i.closest("td"), !i.value.trim()));
  $('.req-tag[data-req-for="week"]').classList.toggle("hidden", !weekEmpty);
  $('.req-tag[data-req-for="dates"]').classList.toggle("hidden", !(fromEmpty || toEmpty));
}
const chips = (items) => items.map((m) => `<span class="chip">${escapeHtml(m)}</span>`).join(" ");
const okNote = (t) => `<span class="ok-text">✓ ${t}</span>`;

/** Cập nhật trạng thái 4 bước + các nút */
function updateGenState() {
  if (!Lbg.tt) return;
  const m1 = missingTkb(), m2 = missingTt();
  const ready = !m1.length && !m2.length;
  const res = !!Lbg.result;

  // Nút Gen luôn bấm được: thiếu thông tin thì bấm sẽ được dẫn tới ô còn thiếu
  $("#btnGen").disabled = false;
  $("#btnGenArrow").disabled = false;
  $("#btnGen").textContent = res ? "⚙️ Gen lại" : "⚙️ Gen LBG của tôi";
  $("#btnGenArrow").classList.toggle("pulse", ready && (!res || Lbg.stale));
  $("#btnGenArrow").classList.toggle("not-ready", !ready);
  markRequired();
  // Chỉ xuất file khi đã Gen thành công và kết quả còn khớp cột Môn
  const canExport = res && !Lbg.stale;
  ["#btnExcelRes", "#btnWordRes", "#btnCopyRes", "#btnPrintRes"].forEach((id) => { $(id).disabled = !canExport; });
  $("#btnSaveTkb").disabled = !Lbg.tkbDirty;

  const done = [!m1.length, !m2.length, res && !Lbg.stale, res && Lbg.exported];
  const current = done.indexOf(false);
  $$("#stepper .step").forEach((el, i) => {
    el.classList.toggle("done", done[i]);
    el.classList.toggle("current", i === current);
  });

  $("#step1Note").innerHTML = m1.length ? chips(m1) : step1Info();
  const m2Manual = missingTtFields().filter((m) => !m.auto).map((m) => m.label);
  $("#step2Note").innerHTML = m2.length ? "Cần nhập: " + chips(m2Manual) : okNote("Đã nhập đủ LBG mẫu");
  $("#step3Note").innerHTML = !ready ? '<span class="muted">Còn thiếu thông tin – bấm Gen, hệ thống sẽ chỉ tới ô cần nhập</span>'
    : Lbg.stale ? '<span class="warn-text">TKB / cột Môn đã thay đổi – hãy Gen lại</span>'
    : res ? okNote("Đã Gen – xem báo cáo bên dưới")
    : '<span class="muted">Sẵn sàng – bấm Gen hoặc mũi tên ➜</span>';
  $("#step4Note").innerHTML = !res ? '<span class="muted">Có thể dùng sau khi Gen thành công</span>'
    : Lbg.stale ? '<span class="warn-text">Gen lại trước khi xuất file</span>'
    : Lbg.exported ? okNote("Đã xuất file")
    : '<span class="muted">Sửa trực tiếp trên bảng LBG của tôi rồi xuất Excel / Word</span>';
}

/* ================= B3: Gen LBG ================= */
async function genLbg() {
  if (getMissing().length) { guideToMissing(); return; }
  if (Lbg.result && Lbg.resultEdited) {
    const ok = await modal({
      title: "Gen lại LBG?",
      html: "Bạn đã sửa kết quả LBG. Gen lại sẽ <b>ghi đè</b> các chỉnh sửa này.",
      okText: "Gen lại", danger: true,
    });
    if (!ok) return;
  }
  const gvDays = Lbg.gvDays.map((d) => ({ ...d, periods: d.periods.map((p) => ({ ...p, mon: String(p.mon ?? "").trim() })) }));
  // Thông tin ký: lấy bản đang sửa ở bảng LBG của tôi (có thể chưa lưu vào TKB)
  const res = LbgRules.generate({ gvDays, tt: Lbg.tt, sign: curSign() });
  const fd = Lbg.tt.footer || {};
  res.footer.date = { d: fd.d, m: fd.m, y: fd.y }; // để ghép lại dòng ngày ký khi sửa Nơi chốn
  // Gắn khung của Mẫu LBG trường để hiển thị / xuất file (cột, buổi học)
  res.columns = Lbg.tpl.columns;
  res.days.forEach((d, di) => d.rows.forEach((r, ri) => { r.session = sessionOfRow(Lbg.tpl, Lbg.tpl.days[di], ri); }));
  Lbg.result = res;
  Object.assign(Lbg, { resultEdited: false, stale: false, exported: false });
  renderResult();
  updateGenState();
  const r = Lbg.result.report;
  const issues = r.notExist.length + r.over.length + r.leftover.length;
  toast(issues ? `Đã Gen LBG – có ${issues} mục cần kiểm tra (xem báo cáo).` : MSG_ALL_MATCH, issues ? "error" : "success");
}

/* ================= Bảng LBG của tôi ================= */
/** Ô sửa ngày / tháng / năm ký ở bảng LBG của tôi (chỉ có sau khi Gen; không lưu vào TKB) */
function signDateInput(k, w, max) {
  const v = Lbg.result?.footer.date?.[k] ?? "";
  return `<input class="inline-input ${w}" data-signdate="${k}" maxlength="${max}" inputmode="numeric"
           value="${escapeHtml(v)}" title="Sửa ngày ký của LBG tuần này" />`;
}

function renderResult() {
  const res = Lbg.result;
  const s = curSign();
  const lock = (w = "") => `<span class="locked-inline ${w}"></span>`;
  const days = res ? res.days : (Lbg.gvDays || []).map((d) => ({
    label: d.label,
    rows: d.periods.map((p) => ({ tiet: p.tiet, mon: p.mon, ppct: "", tenBai: "", ddhd: "", status: "" })),
  }));

  const tpl = Lbg.tpl;
  const body = days.map((day, di) => day.rows.map((r, ri) => {
    const n = day.rows.length;
    const attrs = (f) => `data-dayi="${di}" data-rowi="${ri}" data-field="${f}"`;
    const field = (f, cls = "") => res
      ? (f === "tenBai"
        ? `<td class="editable res ${cls}"><textarea class="auto" rows="1" ${attrs(f)}>${escapeHtml(r[f])}</textarea></td>`
        : `<td class="editable res ${cls}"><input ${attrs(f)} value="${escapeHtml(r[f])}" /></td>`)
      : `<td class="locked ${cls}"></td>`;
    const cell = {
      day: () => (ri === 0
        ? `<td class="day locked" rowspan="${n}">${res ? escapeHtml(day.label)
            : `${escapeHtml(day.label)}<span class="day-date">(${lock()})</span>`}</td>`
        : ""),
      session: () => sessionTd(di, ri, n),
      tiet: () => `<td class="period locked">${r.tiet}</td>`,
      ppct: () => field("ppct", "ppct"),
      mon: () => `<td class="editable mon-cell"><input ${attrs("mon")} maxlength="60" autocomplete="off" value="${escapeHtml(r.mon)}" title="Sửa môn – bấm “Lưu TKB” để cập nhật TKB" /></td>`,
      tenBai: () => field("tenBai"),
      ddhd: () => field("ddhd"),
    };
    return `<tr class="${rowClass(di, ri, n)} st-${r.status}" data-day="${di}">${tpl.columns.map((c) => (cell[c.key] ? cell[c.key]() : "<td></td>")).join("")}</tr>`;
  }).join("")).join("");

  $("#resPaper").innerHTML = `
    <div class="paper-head">
      <h2 class="week-title">${res ? escapeHtml(res.title) : `TUẦN ${lock()}`}</h2>
      <p class="week-range"><strong>${res ? escapeHtml(res.range) : `(Từ ngày ${lock()} đến ngày ${lock()})`}</strong></p>
    </div>
    <table class="lbg-table">
      <thead>${tableHeadHtml(tpl)}</thead>
      <tbody id="resBody">${body}</tbody>
    </table>
    <div class="sign sign-edit">
      <p class="sign-date"><em>
        <input class="inline-input w-md" data-sign="place" maxlength="60" value="${escapeHtml(s.place)}"
               placeholder="${escapeHtml(SIGN_PLACEHOLDER.place)}" title="Sửa nơi chốn – bấm “Lưu TKB” để cập nhật TKB" />,
        ngày ${res ? signDateInput("d", "w-xs", 2) : lock()}
        tháng ${res ? signDateInput("m", "w-xs", 2) : lock()}
        năm ${res ? signDateInput("y", "w-sm", 4) : lock()}
      </em></p>
      <p class="sign-role"><input class="inline-input w-lg bold" data-sign="role" maxlength="80" value="${escapeHtml(s.role)}"
               placeholder="${escapeHtml(SIGN_PLACEHOLDER.role)}" title="Sửa chức vụ lãnh đạo – bấm “Lưu TKB” để cập nhật TKB" /></p>
      <div class="sign-space"></div>
      <p class="sign-name"><input class="inline-input w-lg bold" data-sign="leader" maxlength="80" value="${escapeHtml(s.leader)}"
               placeholder="${escapeHtml(SIGN_PLACEHOLDER.leader)}" title="Sửa tên lãnh đạo – bấm “Lưu TKB” để cập nhật TKB" /></p>
    </div>`;
  autoSizeAll($("#resPaper"));
  renderReport();
  markLeftoverRows();
  scheduleSync();
}

/**
 * Báo cáo sau khi Gen – nằm TRÊN 2 bảng, chia 2 cột thẳng hàng với 2 bảng:
 *   cột trái  (LBG mẫu)     : bài chưa khớp ở LBG mẫu
 *   cột phải  (LBG của tôi) : "Không tồn tại ở LBG Mẫu", "Thừa tiết so với LBG Mẫu"
 * Bấm vào 1 mục -> cuộn tới dòng tương ứng.
 */
function renderReport() {
  const box = $("#genReport");
  if (!Lbg.result) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const r = Lbg.result.report;
  // LBG của tôi: gộp các tiết bị ghi chú (3.2 + 3.4) thành 1 danh sách, theo thứ tự ngày / tiết
  const mine = [
    ...r.notExist.map((i) => ({ ...i, text: `${i.text} – ${LbgRules.NOT_EXIST}` })),
    ...r.over.map((i) => ({ ...i, text: `${i.text} – ${LbgRules.OVER} (môn này thừa ${i.overBy} tiết)` })),
  ].sort((a, b) => a.di - b.di || a.ri - b.ri);
  const total = mine.length + r.leftover.length;
  const sec = (title, items, table) => `
    <div class="rep-sec ${items.length ? "bad" : "ok"}">
      <div class="rep-title"><b>${title}</b><span class="rep-count">${items.length}</span></div>
      ${items.length
        ? `<ul>${items.map((i) => `<li><button type="button" class="rep-link" data-table="${table}" data-di="${i.di}" data-ri="${i.ri}"
             title="Bấm để tới dòng này">${escapeHtml(i.text)}</button></li>`).join("")}</ul>`
        : '<div class="rep-ok">✓ Không có</div>'}
    </div>`;
  // Trường hợp 2 bên đều khớp: chỉ hiện 1 thông báo ngắn
  if (!total) {
    box.innerHTML = `
      <div class="report-head">
        <h3>📋 Báo cáo sau khi Gen</h3>
      </div>
      <div class="report-note ok">✅ ${MSG_ALL_MATCH}</div>`;
    box.classList.remove("hidden");
    return;
  }
  box.innerHTML = `
    <div class="report-head">
      <h3>📋 Báo cáo sau khi Gen</h3>
      <span class="warn-text">${total} dòng cần kiểm tra – đã tô đỏ trong bảng, bấm vào từng mục để tới dòng đó</span>
    </div>
    <div class="report-grid">
      <div class="report-col">
        <div class="report-col-title"><span class="dot sample"></span>LBG mẫu</div>
        ${sec("Danh sách Môn/ Tiết chưa khớp với LBG của tôi. Hãy kiểm tra lại tên môn và số tiết", r.leftover, "tt")}
      </div>
      <div class="report-gap"></div>
      <div class="report-col">
        <div class="report-col-title"><span class="dot mine"></span>LBG của tôi</div>
        ${sec("Danh sách Môn/ Tiết không khớp với LBG mẫu. Hãy kiểm tra lại tên môn và số tiết", mine, "res")}
      </div>
    </div>
    <div class="report-note warn">💡 ${MSG_FIX_HINT}</div>`;
  box.classList.remove("hidden");
}

/* Thông báo của báo cáo sau khi Gen */
const MSG_ALL_MATCH = "Gen hoàn tất, dữ liệu 2 bên đều khớp.";
const MSG_FIX_HINT = "Hãy sửa lại <b>TÊN MÔN</b> ở LBG Mẫu hoặc LBG của tôi để 2 bên đều khớp. "
  + "Nếu bạn sửa <b>TÊN MÔN</b> ở LBG của tôi, hãy chọn <b>💾 Lưu TKB</b> để sử dụng những lần sau.";

/** Tô đỏ các dòng "bài chưa khớp" ở bảng LBG mẫu theo kết quả Gen gần nhất */
function markLeftoverRows() {
  const set = new Set((Lbg.result ? Lbg.result.report.leftover : []).map((i) => `${i.di}-${i.ri}`));
  const byDay = {};
  $$("#ttBody tr[data-day]").forEach((tr) => {
    const di = tr.dataset.day;
    byDay[di] = (byDay[di] ?? -1) + 1;
    tr.classList.toggle("st-leftover", set.has(`${di}-${byDay[di]}`));
  });
}

/** Cuộn tới dòng trong bảng (tt = LBG mẫu, res = LBG của tôi) và nháy sáng */
function gotoRow(table, di, ri) {
  const sel = table === "tt" ? "#ttBody" : "#resBody";
  const tr = $$(`${sel} tr[data-day="${di}"]`)[ri];
  if (!tr) return;
  tr.scrollIntoView({ behavior: "smooth", block: "center" });
  tr.classList.remove("row-flash");
  void tr.offsetWidth;
  tr.classList.add("row-flash");
}

/* ---------- Sửa cột Môn + thông tin ký -> Lưu vào TKB ---------- */
function countMonChanges() {
  const saved = mergeWithTemplate((currentTkb() || {}).days, Lbg.tpl);
  let n = 0;
  Lbg.gvDays.forEach((d, di) => d.periods.forEach((p, pi) => {
    if (String(p.mon ?? "").trim() !== String(saved[di].periods[pi].mon ?? "").trim()) n++;
  }));
  return n;
}

/** Các trường ký đã đổi so với TKB đã lưu: [{ key, label, from, to }] */
function signChanges() {
  const saved = signOf(currentTkb()), cur = curSign();
  return SIGN_FIELDS
    .filter((f) => String(saved[f.key] || "").trim() !== cur[f.key])
    .map((f) => ({ key: f.key, label: f.label, from: String(saved[f.key] || "").trim(), to: cur[f.key] }));
}

const recalcTkbDirty = () => { Lbg.tkbDirty = countMonChanges() > 0 || signChanges().length > 0; };

function onMonEdit(el) {
  const di = +el.dataset.dayi, ri = +el.dataset.rowi;
  Lbg.gvDays[di].periods[ri].mon = el.value;
  if (Lbg.result) {
    Lbg.result.days[di].rows[ri].mon = el.value;
    Lbg.stale = true;
  }
  recalcTkbDirty();
  syncDirty();
  updateGenState();
}

/** Sửa Nơi chốn / Chức vụ lãnh đạo / Tên lãnh đạo ở cuối bảng LBG của tôi */
function onSignEdit(el) {
  Lbg.sign[el.dataset.sign] = el.value;
  applySignToResult();   // kết quả đã Gen cập nhật ngay, không cần Gen lại
  renderTtSign();        // bảng LBG mẫu hiển thị cùng thông tin ký
  recalcTkbDirty();
  syncDirty();
  updateGenState();
}

async function saveMonToTkb() {
  const tkb = currentTkb();
  if (!tkb || !Lbg.tkbDirty) return;
  const n = countMonChanges();
  const sc = signChanges();
  const items = [];
  if (n) items.push(`<li><b>${n}</b> tiết đã sửa ở cột Môn</li>`);
  sc.forEach((c) => items.push(`<li>${escapeHtml(c.label)}: ${c.from ? `<s>${escapeHtml(c.from)}</s> → ` : ""}<b>${escapeHtml(c.to) || "<i>(để trống)</i>"}</b></li>`));
  const ok = await modal({
    title: "Lưu thay đổi vào TKB?",
    html: `Cập nhật vào TKB <b>${escapeHtml(tkb.name)}</b>:<ul class="modal-list">${items.join("")}</ul>
           Các lần tạo LBG sau từ TKB này sẽ dùng thông tin mới.`,
    okText: "💾 Lưu",
  });
  if (!ok) return;
  const days = Lbg.gvDays.map((d) => ({
    key: d.key, label: d.label,
    periods: d.periods.map((p) => ({ tiet: p.tiet, mon: String(p.mon ?? "").trim() })),
  }));
  const footer = curSign();
  try {
    $("#btnSaveTkb").disabled = true;
    await TkbStorage.save({ ...tkb, days, footer });
    Lbg.gvDays = mergeWithTemplate(days, Lbg.tpl);
    Lbg.sign = { ...footer };
    Lbg.tkbDirty = false;
    syncDirty();
    refreshTkbOptions();
    toast(Lbg.stale ? "Đã cập nhật TKB. Bấm Gen lại để điền bài theo môn mới." : "Đã cập nhật TKB.", "success");
  } catch (e) {
    toast("Lưu thất bại: " + e.message, "error");
  } finally {
    updateGenState();
  }
}

/* ---------- Copy / In / Excel / Word ---------- */
function markExported() {
  Lbg.exported = true;
  updateGenState();
}

/** Xuất file Excel / Word (chỉ khi đã Gen thành công) */
function exportFile(kind) {
  if (!Lbg.result || Lbg.stale) return;
  try {
    const name = LbgExport.baseName(Lbg.tt.week);
    const blob = kind === "xlsx" ? LbgExport.toXlsx(Lbg.result) : LbgExport.toDocx(Lbg.result);
    LbgExport.download(blob, `${name}.${kind}`);
    markExported();
    toast(`Đã tải file “${name}.${kind}”.`, "success");
  } catch (e) {
    console.error(e);
    toast("Xuất file thất bại: " + e.message, "error");
  }
}

async function copyResult() {
  if (!Lbg.result) return;
  const { html, text } = LbgExport.toClipboard(Lbg.result);
  try {
    if (!window.ClipboardItem || !navigator.clipboard?.write) throw new Error("no clipboard api");
    await navigator.clipboard.write([new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([text], { type: "text/plain" }),
    })]);
  } catch {
    const div = document.createElement("div");
    div.contentEditable = "true";
    div.style.cssText = "position:fixed;left:-9999px;top:0";
    div.innerHTML = html;
    document.body.appendChild(div);
    const range = document.createRange();
    range.selectNodeContents(div);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("copy");
    sel.removeAllRanges();
    div.remove();
  }
  markExported();
  toast("Đã copy LBG – mở Word/Excel và nhấn Ctrl+V.", "success");
}

function printResult() {
  if (!Lbg.result) return;
  // In bản sạch: chỉ nội dung LBG, không ô nhập, không ghi chú kiểm tra, không màu tô
  $("#printArea").innerHTML = LbgExport.toPrintHtml(Lbg.result);
  document.body.classList.add("printing-lbg");
  window.print();
  markExported();
}

/* ================= Cân 2 bảng (cùng chiều cao từng dòng) ================= */
let syncRaf = 0;
function scheduleSync() {
  cancelAnimationFrame(syncRaf);
  syncRaf = requestAnimationFrame(syncPanels);
}

function syncPanels() {
  const a = $("#ttPaper"), b = $("#resPaper");
  if (!a || !b || !Lbg.tt || $("#view-lbg").classList.contains("hidden")) return;
  const parts = (p) => p.querySelectorAll(".paper-head, thead tr, tbody tr, .sign");
  [a, b].forEach((p) => parts(p).forEach((el) => { el.style.height = ""; }));

  // Chỉ cân khi 2 bảng nằm cạnh nhau
  const cols = getComputedStyle($(".lbg-panels")).gridTemplateColumns.trim().split(/\s+/).length;
  if (cols < 3) return;

  const h = (el) => el.getBoundingClientRect().height;
  const eq = (x, y) => {
    if (!x || !y) return;
    const m = Math.max(h(x), h(y));
    x.style.height = y.style.height = m + "px";
  };
  eq(a.querySelector(".paper-head"), b.querySelector(".paper-head"));
  eq(a.querySelector("thead tr"), b.querySelector("thead tr"));

  for (let di = 0; di < Lbg.tt.days.length; di++) {
    const A = Array.from(a.querySelectorAll(`tbody tr[data-day="${di}"]`));
    const B = Array.from(b.querySelectorAll(`tbody tr[data-day="${di}"]`));
    if (!A.length || !B.length) continue;
    for (let i = 0; i < Math.min(A.length, B.length); i++) eq(A[i], B[i]);
    // Số tiết khác nhau -> kéo dài dòng cuối của bên ngắn hơn cho khối ngày bằng nhau
    const sum = (rows) => rows.reduce((s, r) => s + h(r), 0);
    const diff = sum(A) - sum(B);
    if (Math.abs(diff) > 0.5) {
      const shorter = diff > 0 ? B : A;
      const last = shorter[shorter.length - 1];
      last.style.height = h(last) + Math.abs(diff) + "px";
    }
  }
  eq(a.querySelector(".sign"), b.querySelector(".sign"));
}

/* ================= Gắn sự kiện ================= */
function bindLbgEvents() {
  // Bước 1: TKB – mọi thao tác TKB đều mở popup, không rời màn hình
  $("#btnLbgCreateTkb").addEventListener("click", () => openEditor(null));
  $("#btnNewTkb").addEventListener("click", () => openEditor(null));
  $("#btnManageTkb").addEventListener("click", openTkbManager);
  $("#btnHeaderManage").addEventListener("click", openTkbManager);
  $("#btnHeaderNew").addEventListener("click", () => openEditor(null));
  $("#btnViewSelectedTkb").addEventListener("click", () => Lbg.tkbId && openEditor(Lbg.tkbId, { readonly: true }));
  $("#btnEditSelectedTkb").addEventListener("click", () => Lbg.tkbId && openEditor(Lbg.tkbId));

  $("#lbgTkbSelect").addEventListener("change", async (e) => {
    if (!(await selectTkb(e.target.value))) e.target.value = Lbg.tkbId;
  });

  $("#ttWeek").addEventListener("input", (e) => { Lbg.tt.week = e.target.value; markTtDirty(); });
  // Ô ngày: gõ dd/mm/yyyy (tự chèn "/"), Enter/blur để xác nhận; hoặc chọn trên lịch
  [["ttFrom", onFromChange], ["ttTo", onToChange]].forEach(([id, handler]) => {
    const inp = $("#" + id);
    inp.addEventListener("input", (e) => { maskDateInput(e); inp.classList.remove("invalid"); });
    inp.addEventListener("change", handler);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } });
    $(`.cal-btn[data-for="${id}"]`).addEventListener("click", () => openDatePicker(id));
    $(`.date-picker[data-for="${id}"]`).addEventListener("change", (e) => {
      inp.value = fmtDMY(e.target.value);
      handler();
    });
  });
  [["#ttFd", "d"], ["#ttFm", "m"], ["#ttFy", "y"]].forEach(([id, k]) => {
    $(id).addEventListener("input", (e) => { Lbg.tt.footer[k] = e.target.value; markTtDirty(); });
  });

  const ttBody = $("#ttBody");
  ttBody.addEventListener("input", (e) => {
    const el = e.target;
    if (el.classList.contains("day-input")) {
      Lbg.tt.days[+el.dataset.dayi].label = el.value;
    } else if (el.dataset.field) {
      Lbg.tt.days[+el.dataset.dayi].rows[+el.dataset.rowi][el.dataset.field] = el.value;
      if (el.tagName === "TEXTAREA") { autoSize(el); scheduleSync(); }
    }
    markTtDirty();
  });
  ttBody.addEventListener("paste", handleTtPaste);
  // Không cho xuống dòng trong ô; Enter -> sang ô cùng cột dòng dưới
  const enterNext = (container) => container.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !e.target.dataset.field) return;
    e.preventDefault();
    const same = $$(`#${container.id} [data-field="${e.target.dataset.field}"]`);
    const next = same[same.indexOf(e.target) + 1];
    if (next) next.focus();
  });
  enterNext(ttBody);

  // Bảng LBG của tôi: sửa cột Môn (-> Lưu TKB) và các cột kết quả
  const resPaper = $("#resPaper");
  resPaper.addEventListener("input", (e) => {
    const el = e.target;
    if (el.dataset.sign) return onSignEdit(el);
    if (el.dataset.signdate && Lbg.result) {
      // Ngày ký riêng của LBG tuần này -> cập nhật kết quả (Copy / In / Excel / Word), không lưu vào TKB
      Lbg.result.footer.date = { ...(Lbg.result.footer.date || {}), [el.dataset.signdate]: el.value.trim() };
      applySignToResult();
      Lbg.resultEdited = true;
      return;
    }
    if (!el.dataset.field) return;
    if (el.dataset.field === "mon") return onMonEdit(el);
    if (!Lbg.result) return;
    Lbg.result.days[+el.dataset.dayi].rows[+el.dataset.rowi][el.dataset.field] = el.value;
    Lbg.resultEdited = true;
    if (el.tagName === "TEXTAREA") { autoSize(el); scheduleSync(); }
  });
  enterNext(resPaper);

  $("#genReport").addEventListener("click", (e) => {
    const b = e.target.closest(".rep-link");
    if (b) gotoRow(b.dataset.table, +b.dataset.di, +b.dataset.ri);
  });

  $("#btnGen").addEventListener("click", genLbg);
  $("#btnGenArrow").addEventListener("click", genLbg);
  $("#btnSaveTkb").addEventListener("click", saveMonToTkb);
  $("#btnClearTt").addEventListener("click", clearTt);
  $("#btnExcelRes").addEventListener("click", () => exportFile("xlsx"));
  $("#btnWordRes").addEventListener("click", () => exportFile("docx"));
  $("#btnCopyRes").addEventListener("click", copyResult);
  $("#btnPrintRes").addEventListener("click", printResult);
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-lbg");
    $("#printArea").innerHTML = "";
  });
  window.addEventListener("resize", scheduleSync);
}
