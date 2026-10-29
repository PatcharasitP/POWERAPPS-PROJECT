// app.js · จุดเริ่มของ Log Electric Desk: รู้ว่าใครเข้า บทบาทอะไร โหลดแถว แล้ววางแท็บตามบทบาท
//   MEMBER, MANAGER: Records, Import   ADMIN: + Settings (ลบทั้งหมด, เลข INDEX)
// Admin สลับดูแอปแบบ Member, Manager, Admin ได้จากป้ายบทบาทมุมขวาบน (พี่ปอนด์ 29/10 รอบ 4) เป็นการดูเท่านั้น สิทธิ์จริงที่ Dataverse ไม่เปลี่ยน
// ข้อความบนจอเป็นภาษาอังกฤษทั้งหมด รวมการ์ดบทบาท (พี่ปอนด์ 29/10 รอบ 3) หน้า Dashboard เอาออกก่อน
import { h, clear, int } from "./util.js";
import { icon, createToast, confirmBox } from "./ui.js";
import * as dv from "./dv.js";
import { createRecords } from "./records.js";
import { createImporter } from "./importer.js";
import { createExporter } from "./exporter.js";

const ROLE_TEXT = { MEMBER: "Member", MANAGER: "Manager", ADMIN: "Admin" };

// role = บทบาทที่หน้าจอแสดงอยู่ realRole = บทบาทจริง allRows = ทุกแถวที่ Dataverse ให้อ่าน rows = แถวตามบทบาทที่แสดง
const state = { user: null, role: "MEMBER", realRole: "MEMBER", allRows: [], rows: [], edits: new Map() };
const main = h("main", { id: "main" });
const toast = createToast(document.body);
const app = { state, toast };

async function reload() {
  const [rows, edits] = await Promise.all([dv.loadAll(), dv.historyCounts()]);
  state.allRows = rows;
  state.edits = edits;
  applyView();
  for (const p of Object.values(pages)) p.render?.();
}
app.reload = reload;

/** ดูแบบ Member = เห็นเฉพาะแถวที่ตัวเองเป็นเจ้าของ เหมือนที่ Dataverse กรองให้ Member จริง */
function applyView() {
  state.rows = state.role === "MEMBER" ? state.allRows.filter((r) => r.ownerId === state.user.id) : state.allRows;
}

/** ตารางว่าง ให้แถวแรกได้ INDEX 1 (Dataverse เริ่มเองที่ 1000 และค่านี้ไม่ติดไปกับ solution) Admin เห็นทุกแถว ว่างจึงว่างจริง */
async function seedIfEmpty() {
  if (state.realRole !== "ADMIN" || state.allRows.length) return;
  try { await dv.setIndexSeed(1); } catch { /* ไม่มีสิทธิ์ตั้ง ปล่อยตามค่าของ Dataverse */ }
}

function settingsPage() {
  const root = h("section", { id: "settings", class: "page narrow" });
  function render() {
    const rows = state.allRows;
    // การ์ดตั้งเลข INDEX เอาออก (พี่ปอนด์ 29/10 รอบ 4) แอปตั้งเริ่ม 1 เองตอนตารางว่าง ปุ่มเดิมเสี่ยงเอาเลขที่เคยใช้แล้วกลับมาใช้ซ้ำ
    const input = h("input", { type: "text", id: "del-confirm", autocomplete: "off", placeholder: "Type DELETE ALL", "aria-label": "Type DELETE ALL to confirm" });
    const btn = h("button", { type: "button", class: "btn danger", id: "btn-del-all", disabled: true }, "Delete all rows");
    const bar = h("progress", { id: "del-progress", hidden: true, max: rows.length, value: 0 });
    input.addEventListener("input", () => { btn.disabled = input.value.trim() !== "DELETE ALL" || !rows.length; });
    btn.addEventListener("click", async () => {
      if (!(await confirmBox(document.body, { title: "Delete every row", body: `${int(rows.length)} rows and all their history will be deleted permanently. Export to XLSX first if you need a copy.`, ok: "Delete all", cancel: "Cancel" }))) return;
      btn.disabled = true; input.disabled = true; bar.hidden = false;
      try {
        const n = await dv.deleteAll((d) => { bar.value = d; btn.textContent = `Deleting ${int(d)}`; });
        toast.show(`Deleted ${int(n)} rows`, { kind: "success" });
      } catch (e) { toast.show(e.message, { kind: "error", ms: 10000 }); }
      await reload();
      await seedIfEmpty();
    });
    clear(root).append(
      h("h2", { class: "page-h" }, "Settings"),
      h("div", { class: "card", id: "roles-card" }, h("b", null, "Roles"),
        h("ul", null,
          h("li", null, "LE Member creates and edits own rows, sees and exports own rows only, cannot delete"),
          h("li", null, "LE Manager sees, edits and exports all rows, cannot delete"),
          h("li", null, "LE Admin sees and edits all rows, can delete any row, including Delete all data below"))),
      h("div", { class: "card", id: "delete-card" }, h("b", null, "Delete all data"),
        h("p", null, `There are ${int(rows.length)} rows. This cannot be undone, and the history of every row is deleted too.`),
        h("div", { class: "row" }, input, btn, bar)));
  }
  return { el: root, render };
}

let pages = {};
async function boot() {
  const bootEl = document.getElementById("boot");
  try {
    state.user = await dv.whoAmI();
    state.role = state.realRole = await dv.myRole(state.user.id);
    if (state.role === "NONE") {
      clear(bootEl).append(h("div", { class: "card err boot-err", id: "no-access" }, h("b", null, "You don't have access to Log Electric yet"),
        h("p", null, "Ask an Admin to give you the LE Member, LE Manager or LE Admin role, then open the app again.")));
      return;
    }
    await reload();
    await seedIfEmpty();
  } catch (e) {
    clear(bootEl).append(h("div", { class: "card err boot-err" }, h("b", null, "Cannot open the app"), h("p", null, e.message),
      h("p", { class: "faint" }, "If it says you have no permission, ask an Admin for the LE Member, LE Manager or LE Admin role.")));
    return;
  }
  const exporter = createExporter(app);
  app.openExport = (rows) => exporter.open(rows);
  pages.records = createRecords(app);
  pages.import = createImporter(app);
  const tabs = [["records", "Records", "table"], ["import", "Import", "download"]];
  if (state.realRole === "ADMIN") { pages.settings = settingsPage(); tabs.push(["settings", "Settings", "gear"]); }

  const nav = h("nav", { class: "tabs", role: "tablist" }, tabs.map(([k, t, ic]) => h("button", { type: "button", role: "tab", class: "tab", "data-tab": k, id: "tab-" + k, onclick: () => go(k) }, icon(ic, 18), h("span", null, t))));
  const bar = h("header", { class: "appbar" }, h("span", { class: "brand" }, "Log Electric"), nav, h("span", { class: "grow" }),
    h("span", { class: "userbox" }, h("span", { class: "uname" }, state.user.name), state.realRole === "ADMIN" ? roleSwitch()
      : h("span", { class: "role", id: "my-role" }, ROLE_TEXT[state.role])));
  let current = "records";
  function roleSwitch() {
    const label = h("span", null, ROLE_TEXT[state.role]);
    const btn = h("button", { type: "button", class: "role role-btn", id: "my-role", "aria-haspopup": "menu", "aria-expanded": "false", title: "View the app as another role" }, label, icon("chev", 14));
    const menu = h("div", { class: "role-menu", id: "role-menu", role: "menu", hidden: true },
      Object.entries(ROLE_TEXT).map(([r, t]) => h("button", { type: "button", role: "menuitemradio", "data-role": r, onclick: () => { close(); setView(r); } }, icon("check", 14), t)));
    const sync = () => { label.textContent = ROLE_TEXT[state.role]; btn.classList.toggle("viewing", state.role !== state.realRole);
      for (const b of menu.children) b.setAttribute("aria-checked", String(b.dataset.role === state.role)); };
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden)); });
    document.addEventListener("click", (e) => { if (!menu.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    function setView(r) {
      state.role = r; applyView(); sync();
      document.getElementById("tab-settings").hidden = r !== "ADMIN";
      go(r !== "ADMIN" && current === "settings" ? "records" : current);
    }
    sync();
    return h("span", { class: "role-wrap" }, btn, menu);
  }
  function go(k) {
    current = k;
    pages.records.closePanel();
    for (const b of nav.children) b.setAttribute("aria-selected", String(b.dataset.tab === k));
    clear(main).append(pages[k].el);
    pages[k].render?.();
    try { localStorage.setItem("le-tab", k); } catch { /* ไม่มีที่เก็บก็ได้ */ }
  }
  app.go = go;
  for (const p of Object.values(pages)) p.render?.();
  bootEl.remove();
  document.body.prepend(bar, main);
  let first = "records";
  try { const t = localStorage.getItem("le-tab"); if (t && pages[t] && t !== "settings") first = t; } catch { /* ใช้ค่าเริ่ม */ }
  go(first);
  document.body.classList.add("app-ready");
}
boot();
