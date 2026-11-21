/**
 * Phần dùng chung: hằng số, tiện ích DOM, popup, đọc clipboard Excel, xử lý ngày.
 */

// Khung ngày / tiết: lấy từ Mẫu LBG của trường (templates.js)
// Tên môn: do người dùng tự nhập vào TKB của họ (không có danh sách gợi ý cố định)

/**
 * Chuẩn hóa tên để SO SÁNH (không thay đổi dữ liệu hiển thị / lưu):
 *  - thống nhất cách mã hóa dấu tiếng Việt (NFC)
 *  - bỏ khoảng trắng ở đầu, cuối VÀ ở giữa ("HĐTN- CC" = "HĐTN-CC", "Tiếng  Việt" = "TiếngViệt")
 *  - không phân biệt chữ hoa / thường
 * Dùng cho Rule 1 khi Gen LBG (so khớp Môn giữa TKB và LBG mẫu).
 */
function normName(s) {
  return String(s ?? "").normalize("NFC").replace(/\s+/g, "").toLocaleLowerCase("vi");
}

/** Trạng thái chung của ứng dụng */
const App = { view: "list", dirty: false };

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Thông báo nhỏ. type: "" | "success" | "error" | "warn"; ms = thời gian hiển thị */
function toast(msg, type = "", ms = 3200) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast " + type;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), ms);
}

function flashCell(el) {
  const td = el.closest("td");
  if (!td) return;
  td.classList.remove("flash");
  void td.offsetWidth;
  td.classList.add("flash");
}

/** Textarea 1 dòng tự giãn chiều cao theo nội dung */
function autoSize(ta) {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}
function autoSizeAll(container) {
  container.querySelectorAll("textarea.auto").forEach(autoSize);
}

/* ================= Popup xác nhận ================= */
function modal({ title, html, okText = "Đồng ý", cancelText = "Hủy", danger = false }) {
  return new Promise((resolve) => {
    const box = $("#modal");
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = html;
    const ok = $("#modalOk"), cancel = $("#modalCancel");
    ok.textContent = okText;
    cancel.textContent = cancelText;
    ok.className = "btn " + (danger ? "danger-solid" : "primary");
    box.classList.remove("hidden");
    ok.focus();

    const close = (result) => {
      box.classList.add("hidden");
      ok.onclick = cancel.onclick = box.onclick = null;
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") { e.preventDefault(); close(true); }
    };
    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
    box.onclick = (e) => { if (e.target === box) close(false); };
    document.addEventListener("keydown", onKey);
  });
}

/* ================= Popup lớn (sheet) – Quản lý TKB, Form TKB ================= */
/** Hàm kiểm tra trước khi đóng popup (trả về Promise<boolean>), đăng ký theo id */
const SheetGuards = {};

function isSheetOpen(id) { return !$("#" + id).classList.contains("hidden"); }

function openSheet(id) {
  const el = $("#" + id);
  el.classList.remove("hidden");
  // popup mở sau nằm trên popup mở trước
  el.style.zIndex = 60 + $$(".sheet:not(.hidden)").length;
  document.body.classList.add("sheet-open");
  el.querySelector(".sheet-body")?.scrollTo(0, 0);
}

/** Đóng popup; force = bỏ qua kiểm tra dữ liệu chưa lưu. Trả về true nếu đã đóng. */
async function closeSheet(id, force = false) {
  if (!force && SheetGuards[id] && !(await SheetGuards[id]())) return false;
  $("#" + id).classList.add("hidden");
  if (!$$(".sheet:not(.hidden)").length) document.body.classList.remove("sheet-open");
  return true;
}

/** Popup đang ở trên cùng (để Esc đóng đúng popup) */
function topSheet() {
  const open = $$(".sheet:not(.hidden)");
  return open.sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0)).pop() || null;
}

/* ================= Khung TKB (theo Mẫu LBG của trường) ================= */
function buildEmptyDays(tpl = getTemplate()) {
  return tpl.days.map((d) => ({
    key: d.key,
    label: d.label,
    periods: Array.from({ length: d.periods }, (_, i) => ({ tiet: i + 1, mon: "" })),
  }));
}

/** Đưa dữ liệu TKB đã lưu về đúng khung của mẫu (thêm/bớt tiết nếu khung khác) */
function mergeWithTemplate(savedDays, tpl = getTemplate()) {
  const days = buildEmptyDays(tpl);
  days.forEach((d) => {
    const saved = (savedDays || []).find((s) => s.key === d.key);
    if (!saved) return;
    d.periods.forEach((p, i) => {
      if (saved.periods && saved.periods[i]) p.mon = saved.periods[i].mon || "";
    });
  });
  return days;
}

/* ================= Đọc clipboard từ Excel ================= */

/** Văn bản của 1 ô trong bảng HTML Excel (bỏ khoảng trắng định dạng HTML, giữ nội dung) */
function htmlCellText(td) {
  const c = td.cloneNode(true);
  c.querySelectorAll("br").forEach((b) => b.replaceWith(" "));
  return c.textContent.replace(/[ \t\r\n\f]+/g, " ").replace(/\u00a0/g, " ").trim();
}

/**
 * Bảng HTML Excel -> lưới 2 chiều. Mỗi <tr> là 1 dòng (kể cả dòng trống).
 * Ô gộp (rowspan/colspan): ô đầu lấy nội dung, các ô còn lại là ô trống.
 */
function parseHtmlGrid(html) {
  if (!html || !/<table/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const trs = Array.from(doc.querySelectorAll("table tr"));
  if (!trs.length) return null;
  const grid = [];
  trs.forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    Array.from(tr.cells).forEach((td) => {
      while (grid[r][c] !== undefined) c++;
      const rs = Math.max(1, td.rowSpan || 1);
      const cs = Math.max(1, td.colSpan || 1);
      const text = htmlCellText(td);
      for (let i = 0; i < rs; i++) {
        grid[r + i] = grid[r + i] || [];
        for (let j = 0; j < cs; j++) grid[r + i][c + j] = i === 0 && j === 0 ? text : "";
      }
      c += cs;
    });
  });
  const rows = grid.slice(0, trs.length);
  const nCols = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((row) => Array.from({ length: nCols }, (_, i) => row[i] ?? ""));
}

/** Văn bản dạng tab (TSV) của Excel -> lưới 2 chiều. Giữ dòng trống, hỗ trợ ô có xuống dòng ("..."). */
function parseTsv(text) {
  const s = String(text || "").replace(/\r\n?/g, "\n");
  const rows = [];
  let row = [], cell = "", inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuote) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQuote = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") { inQuote = true; continue; }
    if (ch === "\t") { row.push(cell); cell = ""; continue; }
    if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; continue; }
    cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const nCols = Math.max(1, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: nCols }, (_, i) => (r[i] ?? "").replace(/\n/g, " ").trim()));
}

/**
 * Đọc lưới dữ liệu từ sự kiện paste. Trả về null nếu chỉ có 1 ô (để trình duyệt dán bình thường).
 */
function readClipboardGrid(e) {
  const cb = e.clipboardData || window.clipboardData;
  if (!cb) return null;
  const html = cb.getData("text/html") || "";
  const text = cb.getData("text/plain") || cb.getData("text") || "";
  let grid = parseHtmlGrid(html);
  if (!grid || !grid.length) grid = parseTsv(text);
  if (!grid.length) return null;
  if (grid.length === 1 && grid[0].length <= 1) return null;
  return grid;
}

/* ================= Ngày tháng ================= */
const pad2 = (n) => String(n).padStart(2, "0");

function parseISODate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function toISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Ngày Thứ Hai của tuần chứa ngày d */
function mondayOf(d) {
  return addDays(d, -((d.getDay() + 6) % 7));
}
/** Định dạng như file tổ trưởng: 07/9/2026 */
function fmtRangeDate(iso) {
  const d = parseISODate(iso);
  return d ? `${pad2(d.getDate())}/${d.getMonth() + 1}/${d.getFullYear()}` : "";
}
/** ISO -> dd/mm/yyyy (ô nhập ngày) */
function fmtDMY(iso) {
  const d = parseISODate(iso);
  return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : "";
}
/**
 * dd/mm/yyyy (chấp nhận d/m/yyyy, dấu "-" hoặc ".") -> ISO.
 * Trả về "" nếu ô trống, null nếu sai định dạng / ngày không tồn tại.
 */
function parseDMY(text) {
  const s = String(text || "").trim();
  if (!s) return "";
  const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getFullYear() !== +m[3] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[1]) return null;
  return toISO(d);
}

/** Định dạng nhãn ngày: HAI (7/9) */
function fmtDayLabel(base, d) {
  return `${base} (${d.getDate()}/${d.getMonth() + 1})`;
}
