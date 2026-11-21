/**
 * US1 – Tạo thời khóa biểu của tôi.
 *  - Số tuần, ngày, PPCT, Tên bài, ĐDDH, ngày ký : để trống, không cho sửa
 *  - Mẫu LBG của trường : chọn khung (cột, buổi học, số tiết mỗi ngày) – templates.js
 *  - Thứ/ngày, Buổi học, Tiết : tự điền theo mẫu
 *  - Môn           : cho nhập (hỗ trợ dán cả cột từ Excel, giữ ô trống)
 *  - Nơi chốn, Chức vụ, Tên lãnh đạo : cho nhập, bắt buộc
 */
const TkbEditor = { editingId: null, templateId: DEFAULT_TEMPLATE_ID, readonly: false, dirty: false };

const editorTpl = () => getTemplate(TkbEditor.templateId);

function renderTkbForm(days) {
  const tpl = editorTpl();
  $("#tkbHead").innerHTML = tableHeadHtml(tpl);
  const rows = [];
  days.forEach((day, di) => {
    const n = day.periods.length;
    day.periods.forEach((p, pi) => {
      const ses = sessionSpan(tpl, tpl.days[di], pi, n);
      const cell = {
        day: () => (pi === 0
          ? `<td class="day locked" rowspan="${n}" title="Không cho sửa">
               ${escapeHtml(day.label)}
               <span class="day-date">(<span class="locked-inline" style="min-width:36px"></span>)</span>
             </td>`
          : ""),
        session: () => (ses ? `<td class="session locked" rowspan="${ses.rowspan}" title="Theo mẫu LBG của trường">${escapeHtml(ses.label)}</td>` : ""),
        tiet: () => `<td class="period locked" title="Không cho sửa">${p.tiet}</td>`,
        ppct: () => `<td class="locked ppct" title="Không cho sửa"></td>`,
        mon: () => `<td class="editable">
            <input type="text" maxlength="60" autocomplete="off"
                   data-day="${di}" data-period="${pi}" value="${escapeHtml(p.mon)}" />
          </td>`,
        tenBai: () => `<td class="locked" title="Không cho sửa"></td>`,
        ddhd: () => `<td class="locked" title="Không cho sửa"></td>`,
      };
      const cls = [pi === 0 ? "day-start" : "", ses && ses.start ? "ses-start" : ""].join(" ").trim();
      rows.push(`<tr class="${cls}">${tpl.columns.map((c) => (cell[c.key] ? cell[c.key]() : "<td></td>")).join("")}</tr>`);
    });
  });
  $("#tkbBody").innerHTML = rows.join("");
}

function renderTemplateOptions() {
  $("#tkbTemplate").innerHTML = LBG_TEMPLATES
    .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("");
  $("#tkbTemplate").value = TkbEditor.templateId;
}

/** Đổi mẫu LBG: giữ lại các môn đã nhập (theo ngày + thứ tự tiết) rồi dựng lại form */
function onTemplateChange(e) {
  const kept = collectTkbForm();
  TkbEditor.templateId = e.target.value;
  renderTkbForm(mergeWithTemplate(kept, editorTpl()));
  TkbEditor.dirty = true;
}

function collectTkbForm() {
  const days = buildEmptyDays(editorTpl());
  $$("#tkbBody input[data-day]").forEach((inp) => {
    days[+inp.dataset.day].periods[+inp.dataset.period].mon = inp.value.trim();
  });
  return days;
}

/** Thông tin ký (KHÔNG bắt buộc) – dùng chung cho form TKB và bảng LBG của tôi */
const SIGN_FIELDS = [
  { id: "fPlace", key: "place", label: "Nơi chốn" },
  { id: "fRole", key: "role", label: "Chức vụ lãnh đạo" },
  { id: "fLeader", key: "leader", label: "Tên lãnh đạo" },
];
const SIGN_PLACEHOLDER = {
  place: "Nơi chốn (VD: Đông Hội)",
  role: "Chức vụ lãnh đạo (VD: Tổ trưởng chuyên môn)",
  leader: "Tên lãnh đạo (VD: Nguyễn Thị A)",
};

/**
 * Mở form TKB.
 *  - id = null            : Tạo TKB của tôi
 *  - id, readonly = false : Sửa TKB của tôi
 *  - id, readonly = true  : Xem TKB của tôi (chỉ đọc, có nút chuyển sang Sửa)
 */
function openEditor(id = null, { readonly = false } = {}) {
  TkbEditor.editingId = id;
  const tkb = id ? TkbStorage.get(id) : null;
  const ro = !!(tkb && readonly);
  TkbEditor.readonly = ro;
  $("#editorTitle").textContent = !tkb ? "Tạo TKB của tôi" : ro ? "Xem TKB của tôi" : "Sửa TKB của tôi";
  $("#tkbName").value = tkb ? tkb.name : "";
  SIGN_FIELDS.forEach((f) => { $("#" + f.id).value = (tkb && tkb.footer && tkb.footer[f.key]) || ""; });
  ["#tkbName", ...SIGN_FIELDS.map((f) => "#" + f.id)].forEach((s) => $(s).classList.remove("invalid"));
  TkbEditor.templateId = templateOf(tkb).id;
  renderTemplateOptions();

  // Đang sửa đúng TKB đang dùng ở Bước 1 mà bảng "LBG của tôi" có sửa cột Môn / thông tin ký
  // chưa lưu -> đưa luôn vào form để không bị lệch
  const pending = tkb && !ro && typeof lbgPending === "function" ? lbgPending(tkb.id) : null;
  const days = pending ? pending.days : (tkb ? mergeWithTemplate(tkb.days, editorTpl()) : buildEmptyDays(editorTpl()));
  if (pending) SIGN_FIELDS.forEach((f) => { $("#" + f.id).value = pending.sign[f.key] || ""; });
  renderTkbForm(days);
  applyReadonly(ro);
  TkbEditor.dirty = !!pending;
  openSheet("tkbEditorSheet");
  if (pending) toast("Form đã gồm các thay đổi chưa lưu ở bảng LBG của tôi (cột Môn / thông tin ký).", "success");
  if (!ro) $("#tkbName").focus();
}

/** Bật / tắt chế độ chỉ xem cho form TKB */
function applyReadonly(ro) {
  const sheet = $("#tkbEditorSheet");
  sheet.classList.toggle("readonly", ro);
  sheet.querySelectorAll("input, select").forEach((el) => { el.disabled = ro; });
  $("#btnSave").classList.toggle("hidden", ro);
  $("#btnToEdit").classList.toggle("hidden", !ro);
  $("#btnCancel").textContent = ro ? "Đóng" : "Hủy";
}

/** Đóng form TKB: hỏi trước nếu còn thay đổi chưa lưu */
async function confirmCloseEditor() {
  if (!TkbEditor.dirty || TkbEditor.readonly) return true;
  const ok = await modal({
    title: "Thay đổi chưa được lưu",
    html: "Thời khóa biểu có thay đổi <b>chưa được lưu</b>. Nếu đóng, các thay đổi này sẽ bị mất.<br/>Bạn có chắc muốn đóng?",
    okText: "Đóng, không lưu", cancelText: "Ở lại", danger: true,
  });
  if (ok) TkbEditor.dirty = false;
  return ok;
}
SheetGuards.tkbEditorSheet = confirmCloseEditor;

/* ---------- Dán 1 cột từ Excel (giữ ô trống) ---------- */
function handleTkbPaste(e) {
  const inp = e.target;
  if (inp.tagName !== "INPUT" || inp.dataset.day === undefined) return;
  const grid = readClipboardGrid(e);
  if (!grid) return;
  e.preventDefault();

  const values = grid.map((r) => r[0] ?? ""); // chỉ lấy cột đầu
  const inputs = $$("#tkbBody input[data-day]");
  const start = inputs.indexOf(inp);
  const n = Math.min(values.length, inputs.length - start);
  for (let i = 0; i < n; i++) {
    inputs[start + i].value = values[i];
    flashCell(inputs[start + i]);
  }
  TkbEditor.dirty = true;
  const skipped = values.length - n;
  const blanks = values.slice(0, n).filter((v) => !v).length;
  toast(`Đã dán ${n} ô từ Excel (${blanks} ô trống)` + (skipped > 0 ? `, bỏ qua ${skipped} dòng thừa (hết bảng).` : "."),
    skipped > 0 ? "error" : "success");
}

async function clearSubjects() {
  const ok = await modal({
    title: "Xóa tất cả môn",
    html: "Xóa toàn bộ nội dung cột <b>Môn (Phân môn)</b> trong form?",
    okText: "Xóa", danger: true,
  });
  if (!ok) return;
  $$("#tkbBody input[data-day]").forEach((i) => { i.value = ""; });
  TkbEditor.dirty = true;
}

/* ---------- Lưu (có popup hỏi trước) ---------- */
async function saveTkb() {
  const name = $("#tkbName").value.trim();
  const footer = {};
  const missing = [];
  if (!name) { missing.push({ el: $("#tkbName"), label: "Tên TKB" }); }
  // Nơi chốn, Chức vụ, Tên lãnh đạo: KHÔNG bắt buộc
  SIGN_FIELDS.forEach((f) => { footer[f.key] = $("#" + f.id).value.trim(); });
  if (missing.length) {
    missing.forEach((m) => m.el.classList.add("invalid"));
    missing[0].el.focus();
    toast("Vui lòng nhập: " + missing.map((m) => m.label).join(", ") + ".", "error");
    return;
  }
  // Tên TKB: chỉ bắt buộc nhập, KHÔNG kiểm tra trùng

  const days = collectTkbForm();
  const total = days.reduce((n, d) => n + d.periods.length, 0);
  const filled = days.reduce((n, d) => n + d.periods.filter((p) => p.mon).length, 0);
  const perDay = days.map((d) =>
    `<li>Thứ ${escapeHtml(d.label)}: ${d.periods.filter((p) => p.mon).length}/${d.periods.length} tiết có môn</li>`).join("");

  const ok = await modal({
    title: TkbEditor.editingId ? "Lưu thay đổi thời khóa biểu?" : "Lưu thời khóa biểu mới?",
    html: `
      <p>Tên TKB: <b>${escapeHtml(name)}</b></p>
      <p>Mẫu LBG: <b>${escapeHtml(editorTpl().name)}</b></p>
      <p>Đã nhập <b>${filled}/${total}</b> tiết có môn:</p>
      <ul class="modal-list">${perDay}</ul>
      <p>Ký: ${[footer.place, footer.role, footer.leader].some(Boolean)
        ? SIGN_FIELDS.map((f) => (footer[f.key] ? `<b>${escapeHtml(footer[f.key])}</b>` : `<i class="muted">(chưa có ${f.label.toLowerCase()})</i>`)).join(" · ")
        : '<i class="muted">(chưa nhập – có thể bổ sung sau)</i>'}</p>
      ${filled === 0 ? '<p class="warn">⚠️ Bạn chưa nhập môn nào.</p>' : ""}
      <p>Bạn có muốn lưu không?</p>`,
    okText: "💾 Lưu",
  });
  if (!ok) return;

  try {
    $("#btnSave").disabled = true;
    const isNew = !TkbEditor.editingId;
    const saved = await TkbStorage.save({ id: TkbEditor.editingId || undefined, name, templateId: TkbEditor.templateId, days, footer });
    TkbEditor.editingId = saved.id;
    TkbEditor.dirty = false;
    await closeSheet("tkbEditorSheet", true);
    toast(`Đã lưu TKB "${saved.name}".`, "success");
    if (isNew) TkbManager.page = 1; // TKB mới nằm đầu trang 1
    renderList();
    await onTkbSaved(saved, isNew); // lbg.js: cập nhật Bước 1 / bảng LBG
  } catch (e) {
    toast("Lưu thất bại: " + e.message, "error");
  } finally {
    $("#btnSave").disabled = false;
  }
}

/* ---------- Danh sách TKB ---------- */
/** ISO -> "dd/mm/yyyy HH:mm" */
function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || "";
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* Phân trang danh sách TKB */
const TKB_PAGE_SIZE = 10;
const TkbManager = { page: 1 };

/** Danh sách TKB của tôi – dạng bảng, mới cập nhật xếp trên cùng (TkbStorage.list() đã sắp xếp) */
function renderList() {
  const all = TkbStorage.list();
  const box = $("#tkbList");
  if (!all.length) {
    box.innerHTML = `<div class="empty">Bạn chưa có thời khóa biểu nào.<br/>Nhấn <b>“+ Tạo TKB của tôi”</b> để bắt đầu.</div>`;
    $("#tkbPager").innerHTML = "";
    $("#tkbPager").classList.add("hidden");
    return;
  }
  const pages = Math.ceil(all.length / TKB_PAGE_SIZE);
  TkbManager.page = Math.min(Math.max(1, TkbManager.page), pages);
  const offset = (TkbManager.page - 1) * TKB_PAGE_SIZE;
  const list = all.slice(offset, offset + TKB_PAGE_SIZE);
  const activeId = typeof Lbg !== "undefined" ? Lbg.tkbId : null;
  const rows = list.map((t, idx) => {
    const i = offset + idx;
    const tpl = templateOf(t);
    const count = mergeWithTemplate(t.days, tpl).reduce((n, d) => n + d.periods.filter((p) => p.mon).length, 0);
    const f = t.footer || {};
    const signOk = f.place && f.role && f.leader;
    const active = t.id === activeId;
    return `
      <tr class="${active ? "is-active" : ""}">
        <td class="c-stt">${i + 1}</td>
        <td class="c-name">
          <button class="link" data-act="view" data-id="${t.id}" title="Xem TKB">${escapeHtml(t.name)}</button>
          ${active ? '<span class="badge">Đang dùng</span>' : ""}
          <div class="sub">${count} tiết có môn${signOk ? "" : " · chưa có thông tin ký"}</div>
        </td>
        <td class="c-tpl">${escapeHtml(tpl.name)}</td>
        <td class="c-date">${escapeHtml(formatDate(t.updatedAt))}</td>
        <td class="c-act">
          <div class="act-group">
            <button class="icon-btn" data-act="view" data-id="${t.id}" title="Xem">👁<span>Xem</span></button>
            <button class="icon-btn" data-act="edit" data-id="${t.id}" title="Sửa">✏️<span>Sửa</span></button>
            <button class="icon-btn danger" data-act="delete" data-id="${t.id}" title="Xóa">🗑<span>Xóa</span></button>
            <button class="btn small primary" data-act="lbg" data-id="${t.id}" title="Chọn TKB này ở Bước 1 để tạo LBG">📅 Tạo LBG</button>
          </div>
        </td>
      </tr>`;
  }).join("");
  box.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr>
          <th class="c-stt">STT</th><th>Tên TKB</th><th>Mẫu LBG trường</th><th>Ngày cập nhật</th><th class="c-act">Thao tác</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  // Thanh phân trang nằm ở chân popup – luôn nhìn thấy
  $("#tkbPager").innerHTML = renderPager(all.length, pages);
  $("#tkbPager").classList.remove("hidden");
}

/** Thanh phân trang: "Hiển thị 1–10 / 23 TKB"  ‹ 1 2 3 › */
function renderPager(total, pages) {
  const p = TkbManager.page;
  const from = (p - 1) * TKB_PAGE_SIZE + 1;
  const to = Math.min(p * TKB_PAGE_SIZE, total);
  // Hiện tối đa 7 nút số trang, có "…" khi nhiều trang
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - p) <= 2) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = (label, page, { disabled = false, active = false, title = "" } = {}) =>
    `<button class="pg-btn${active ? " active" : ""}" data-page="${page}" ${disabled ? "disabled" : ""} ${title ? `title="${title}"` : ""}>${label}</button>`;
  return `
    <div class="pager">
      <div class="pager-info">Hiển thị <b>${from}–${to}</b> / ${total} TKB</div>
      ${pages > 1 ? `<div class="pager-nav">
        ${btn("‹", p - 1, { disabled: p === 1, title: "Trang trước" })}
        ${nums.map((n) => (n === "…" ? '<span class="pg-gap">…</span>' : btn(n, n, { active: n === p }))).join("")}
        ${btn("›", p + 1, { disabled: p === pages, title: "Trang sau" })}
      </div>` : ""}
    </div>`;
}

/** Mở popup Quản lý TKB của tôi */
function openTkbManager() {
  TkbManager.page = 1;
  renderList();
  openSheet("tkbManagerSheet");
}

function bindTkbEvents() {
  $("#btnCreate").addEventListener("click", () => openEditor(null));
  $("#btnCancel").addEventListener("click", () => closeSheet("tkbEditorSheet"));
  $("#btnToEdit").addEventListener("click", () => openEditor(TkbEditor.editingId));
  $("#btnSave").addEventListener("click", saveTkb);
  $("#btnClear").addEventListener("click", clearSubjects);

  ["#tkbName", ...SIGN_FIELDS.map((f) => "#" + f.id)].forEach((s) => {
    $(s).addEventListener("input", (e) => { e.target.classList.remove("invalid"); TkbEditor.dirty = true; });
  });
  $("#tkbTemplate").addEventListener("change", onTemplateChange);
  $("#tkbBody").addEventListener("input", () => { TkbEditor.dirty = true; });
  $("#tkbBody").addEventListener("paste", handleTkbPaste);

  // Enter trong ô Môn -> sang ô kế tiếp
  $("#tkbBody").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
    e.preventDefault();
    const inputs = $$("#tkbBody input");
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) next.focus(); else $("#fPlace").focus();
  });

  $("#tkbPager").addEventListener("click", (e) => {
    const pg = e.target.closest("button.pg-btn[data-page]");
    if (!pg || pg.disabled) return;
    TkbManager.page = +pg.dataset.page;
    renderList();
    $("#tkbManagerSheet .sheet-body").scrollTo(0, 0);
  });

  $("#tkbList").addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const { act, id } = btn.dataset;
    if (act === "view") openEditor(id, { readonly: true });
    if (act === "edit") openEditor(id);
    if (act === "lbg") {
      // Chọn TKB này ở Bước 1 rồi đóng popup
      if (await selectTkb(id)) {
        await closeSheet("tkbManagerSheet", true);
        toast(`Đang dùng TKB "${TkbStorage.get(id).name}" ở Bước 1.`, "success");
      }
    }
    if (act === "delete") {
      const t = TkbStorage.get(id);
      if (!t) return;
      const inUse = typeof Lbg !== "undefined" && Lbg.tkbId === id;
      const ok = await modal({
        title: "Xóa TKB của tôi",
        html: `Bạn có chắc muốn xóa TKB <b>${escapeHtml(t.name)}</b>?<br/>Thao tác này không hoàn tác được.`
          + (inUse ? "<br/><br/>⚠️ TKB này <b>đang được dùng ở Bước 1</b> – kết quả LBG hiện tại sẽ bị xóa." : ""),
        okText: "Xóa", danger: true,
      });
      if (!ok) return;
      try {
        await TkbStorage.remove(id);
        await onTkbDeleted(id); // lbg.js
        renderList();
        toast("Đã xóa TKB.");
      } catch (err) { toast("Xóa thất bại: " + err.message, "error"); }
    }
  });
}
