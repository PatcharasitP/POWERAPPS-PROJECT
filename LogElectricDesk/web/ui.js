// ui.js · ส่วนประกอบหน้าจอที่ใช้ร่วมกัน: ไอคอนเส้น, toast, กล่องยืนยัน, แผงข้าง (ยกมาจาก Pending VAT Desk)
import { h, clear, append } from "./util.js";


const SVG_NS = "http://www.w3.org/2000/svg";
const PATHS = {
  list: "M8 6h12M8 12h12M8 18h12M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  send: "M21 3 10 14M21 3l-7 18-4-7-7-4z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  table: "M3 5h18v14H3zM3 10h18M9 5v14",
  users: "M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15 5.2a3.5 3.5 0 0 1 0 6.6",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  close: "M6 6l12 12M18 6 6 18",
  refresh: "M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4",
  chev: "M9 6l6 6-6 6",
  print: "M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  check: "M5 12.5l4.5 4.5L19 7",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z",
  alert: "M12 3.5 2.5 20h19zM12 10v4.5M12 17.5h.01",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  calendar: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  columns: "M4 4h16v16H4zM9.33 4v16M14.67 4v16",
  funnel: "M3 5h18l-7 8.5V19l-4 2v-7.5z",
  plus: "M12 5v14M5 12h14",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  file: "M14 3H6v18h12V7zM14 3v4h4",
  group: "M4 6h16M4 12h10M4 18h6",
};
export function icon(name, size = 22) {
  const s = document.createElementNS(SVG_NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", size);
  s.setAttribute("height", size);
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.7");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", PATHS[name] || PATHS.more);
  s.append(p);
  return s;
}


let toastTimer = null;
export function createToast(root) {
  const el = h("div", { id: "toast", role: "status", "aria-live": "polite" });
  root.append(el);
  function hide() {
    clearTimeout(toastTimer);
    el.classList.remove("show");
    const u = el.querySelector("#toast-undo");
    if (u) u.remove(); // ซ่อนแล้ว Undo ต้องกดด้วยคีย์บอร์ดไม่ได้ (รีวิวรอบ 15 ข้อ 5) ข้อความคงไว้ให้จางหายตามเดิม
  }
  /** show(msg, {undo: async fn, ms}) */
  function show(msg, opts = {}) {
    clearTimeout(toastTimer);
    clear(el);
    if (opts.kind === "success") el.append(h("span", { class: "toast-ic", "aria-hidden": "true" }, icon("check", 14)));
    el.append(h("span", { class: "toast-msg" }, msg));
    if (opts.undo) {
      el.append(h("button", { id: "toast-undo", class: "btn link", type: "button", onclick: async () => {
        const fn = opts.undo;
        hide();
        await fn();
      } }, "Undo"));
    }
    if (opts.kind) el.dataset.kind = opts.kind; else delete el.dataset.kind;
    el.classList.add("show");
    toastTimer = setTimeout(hide, opts.ms ?? 6000);
  }
  return { show, hide, el };
}

// ---- กล่องโต้ตอบ (dialog มาตรฐาน) ----
export function openDialog(dlg) {
  if (typeof dlg.showModal === "function") { if (!dlg.open) dlg.showModal(); }
  else dlg.setAttribute("open", "");
}
export function closeDialog(dlg) {
  if (typeof dlg.close === "function") { if (dlg.open) dlg.close(); }
  else dlg.removeAttribute("open");
}

/** กล่องยืนยันทั่วไป คืน Promise<boolean> */
export function confirmBox(root, { title, body, ok = "OK", cancel = "Cancel" }) {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "dlg" },
      h("h2", null, title),
      h("div", { class: "dlg-body" }, body),
      h("div", { class: "dlg-foot" },
        h("button", { class: "btn", type: "button", onclick: () => { closeDialog(dlg); } }, cancel),
        h("button", { class: "btn dark", type: "button", onclick: () => { dlg.dataset.ok = "1"; closeDialog(dlg); } }, ok)));
    dlg.addEventListener("close", () => { const v = dlg.dataset.ok === "1"; dlg.remove(); resolve(v); });
    root.append(dlg);
    openDialog(dlg);
  });
}

/** แผงข้าง (คอม) / แผ่นล่าง (มือถือ) : สร้างครั้งเดียว เปิดปิดด้วยคลาส open */
export function createSidePanel(id, title) {
  const titleEl = h("h2", { class: "sp-title" }, title);
  const subEl = h("div", { class: "sp-sub" });
  const body = h("div", { class: "sp-body" });
  const foot = h("div", { class: "sp-foot" });
  const closeBtn = h("button", { class: "sp-close btn icon", type: "button", "aria-label": "Close" }, icon("close", 20));
  const el = h("aside", { id, class: "side-panel", "aria-hidden": "true" },
    h("div", { class: "sp-head" }, h("div", { class: "sp-headtext" }, titleEl, subEl), closeBtn), body, foot);
  const api = {
    el, titleEl, subEl, body, foot, closeBtn,
    get isOpen() { return el.classList.contains("open"); },
    open() { el.classList.add("open"); el.setAttribute("aria-hidden", "false"); document.body.classList.add("panel-open"); },
    close() { el.classList.remove("open"); el.setAttribute("aria-hidden", "true"); document.body.classList.remove("panel-open"); api.onClose && api.onClose(); },
    onClose: null,
  };
  closeBtn.addEventListener("click", () => api.close());
  return api;
}
export { h, clear, append };

/**
 * ตรึงคอลัมน์ซ้ายแบบ Freeze Panes ของ Excel: ตั้งแต่คอลัมน์แรกถึงคอลัมน์ uptoKey (ปกติ Vendor/Customer Name)
 * ถ้าไม่มีคอลัมน์นั้นหรือส่วนที่ตรึงกว้างเกินครึ่งกรอบ ตรึงแค่ช่องติ๊ก จอแคบ (การ์ด) ไม่ตรึง
 * วัดใหม่เองเมื่อกรอบเปลี่ยนขนาด (เช่น เปิดแผงกรอก)
 */
export function freezeColumns(table, uptoKey = "proNumber", maxShare = 0.5) {
  const run = () => {
    const wrap = table.parentElement;
    if (!wrap || !table.isConnected) { ro && ro.disconnect(); return; }
    for (const c of table.querySelectorAll(".frz")) { c.classList.remove("frz", "frz-last"); c.style.left = ""; }
    if (window.matchMedia("(max-width: 639px)").matches || !table.tHead) return;
    if (!uptoKey) return; // ผู้ใช้เลือก เลิกตรึง
    const ths = [...table.tHead.rows[0].cells];
    let idx = ths.findIndex((th) => th.dataset.col === uptoKey);
    if (idx < 0) idx = 0;
    const lefts = [];
    let x = 0;
    for (let i = 0; i <= idx; i++) { lefts.push(x); x += ths[i].getBoundingClientRect().width; }
    if (x > wrap.clientWidth * maxShare) {
      idx = 0;
      // ผู้ใช้เลือกเองแต่กว้างเกินจอ บอกให้รู้ ไม่เงียบไปเฉย ๆ
      if (maxShare > 0.5 && !table.dataset.frzWarned) { table.dataset.frzWarned = "1"; table.dispatchEvent(new CustomEvent("freeze-too-wide", { bubbles: true })); }
    }
    for (const row of table.rows) {
      if (row.cells.length !== ths.length) continue; // แถวหัวกลุ่ม (colspan) ใช้ sticky ของตัวเอง
      for (let i = 0; i <= idx; i++) {
        const c = row.cells[i];
        c.classList.add("frz");
        if (i === idx) c.classList.add("frz-last");
        c.style.left = lefts[i] + "px";
      }
    }
    for (const gl of table.querySelectorAll(".ghead .gl")) gl.style.maxWidth = Math.max(240, wrap.clientWidth - 24) + "px";
  };
  let ro = null;
  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); };
  if (typeof ResizeObserver === "function" && table.parentElement) { ro = new ResizeObserver(later); ro.observe(table.parentElement); }
  later();
}

