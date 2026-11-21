/**
 * LBG Auto – khởi động (Phương án A: 1 màn hình).
 *  - Màn chính : Lịch báo giảng, process 4 bước       (lbg.js, rules.js, export.js)
 *  - Popup     : Quản lý TKB của tôi (#tkbManagerSheet) (tkb.js)
 *  - Popup     : Tạo / Sửa / Xem TKB (#tkbEditorSheet)  (tkb.js)
 */

/** Đang chạy online (VD GitHub Pages) – không phải máy local / mở file trực tiếp */
const isHostedOnline = () => location.protocol === "https:" && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

function renderStorageBanner(mode) {
  const el = $("#storageBanner");
  if (mode === "file") {
    el.className = "banner ok";
    el.innerHTML = "✅ Dữ liệu được lưu vào file <code>lbg-auto/data/tkb.json</code> – reload trang không bị mất.";
  } else if (isHostedOnline()) {
    // Bản dùng thử online: dữ liệu nằm trong trình duyệt của máy đang dùng
    el.className = "banner warn";
    el.innerHTML = "ℹ️ <b>Bản dùng thử:</b> Thời khóa biểu của bạn được lưu <b>trên trình duyệt của máy này</b>. "
      + "Hãy dùng cùng một máy và một trình duyệt; không mở bằng tab ẩn danh và không xóa dữ liệu duyệt web để tránh mất dữ liệu.";
  } else {
    el.className = "banner warn";
    el.innerHTML = "⚠️ Bạn đang mở trực tiếp file HTML: dữ liệu chỉ lưu tạm trong trình duyệt. " +
      "Hãy chạy <b>start.bat</b> (trong thư mục <code>lbg-auto</code>) để lưu dữ liệu vào file.";
  }
}

function bindSheetEvents() {
  // Nút ✕ trên popup
  $$(".sheet-close[data-close]").forEach((b) => b.addEventListener("click", () => closeSheet(b.dataset.close)));
  // Bấm ra ngoài popup Quản lý TKB thì đóng (form TKB thì không, tránh mất dữ liệu do bấm nhầm)
  $("#tkbManagerSheet").addEventListener("mousedown", (e) => {
    if (e.target.id === "tkbManagerSheet") closeSheet("tkbManagerSheet");
  });
  // Esc đóng popup trên cùng (khi không có hộp xác nhận đang mở)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !$("#modal").classList.contains("hidden")) return;
    const top = topSheet();
    if (top) { e.preventDefault(); closeSheet(top.id); }
  });
}

async function init() {
  bindTkbEvents();
  bindLbgEvents();
  bindSheetEvents();

  // Cảnh báo khi reload / đóng tab mà còn dữ liệu chưa lưu (LBG đang nhập hoặc form TKB)
  window.addEventListener("beforeunload", (e) => {
    if (App.dirty || TkbEditor.dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  const mode = await TkbStorage.init();
  renderStorageBanner(mode);
  openLbg();
}

document.addEventListener("DOMContentLoaded", init);
