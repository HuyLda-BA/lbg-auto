/**
 * Lớp lưu trữ TKB.
 *  - Chế độ "file"  : chạy qua start.bat -> dữ liệu lưu vào lbg-auto/data/tkb.json (reload không mất).
 *  - Chế độ "local" : mở trực tiếp index.html -> lưu tạm trong trình duyệt (localStorage).
 *
 * Cấu trúc 1 TKB:
 * { id, name, createdAt, updatedAt,
 *   days: [ { key: "HAI", label: "HAI", periods: [ { tiet: 1, mon: "Toán" }, ... ] }, ... ] }
 */
const TkbStorage = (() => {
  const LOCAL_KEY = "lbgauto.tkb.v1";
  const API = "api/tkb";
  let mode = "local";
  let cache = [];

  function readLocal() {
    try {
      const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch { return []; }
  }

  async function persist(list) {
    if (mode === "file") {
      const res = await fetch(API, {
        method: "PUT",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(list, null, 2),
      });
      if (!res.ok) throw new Error("Máy chủ không lưu được dữ liệu (HTTP " + res.status + ")");
    } else {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
    }
    cache = list;
  }

  function genId() {
    return "tkb_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  return {
    /** Gọi 1 lần khi mở trang. Trả về "file" hoặc "local". */
    async init() {
      if (location.protocol.startsWith("http")) {
        try {
          const res = await fetch(API, { cache: "no-store" });
          if (res.ok) {
            const data = await res.json();
            mode = "file";
            cache = Array.isArray(data) ? data : [];
            // Chuyển dữ liệu đã tạo trước đó (lưu trong trình duyệt) sang file
            const local = readLocal();
            if (cache.length === 0 && local.length > 0) {
              await persist(local);
              localStorage.removeItem(LOCAL_KEY);
            }
            return mode;
          }
        } catch (e) { console.warn("Không kết nối được máy chủ:", e); }
      }
      mode = "local";
      cache = readLocal();
      return mode;
    },
    mode() { return mode; },
    list() {
      return [...cache].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    },
    get(id) { return cache.find((t) => t.id === id) || null; },
    async save(tkb) {
      const list = [...cache];
      const now = new Date().toISOString();
      let saved;
      const idx = tkb.id ? list.findIndex((t) => t.id === tkb.id) : -1;
      if (idx >= 0) {
        saved = { ...list[idx], ...tkb, updatedAt: now };
        list[idx] = saved;
      } else {
        saved = { ...tkb, id: genId(), createdAt: now, updatedAt: now };
        list.push(saved);
      }
      await persist(list);
      return saved;
    },
    async remove(id) {
      await persist(cache.filter((t) => t.id !== id));
    },
  };
})();
