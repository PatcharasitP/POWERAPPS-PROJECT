// records.js · หน้า Records: ตารางทุกแถวที่ผู้ใช้เห็น ตัวกรองแบบ Excel ทุกคอลัมน์ ค้นหา Group by เพิ่ม แก้ ดูประวัติ
import { ALL_COLS, INPUT_FIELDS, FIELDS } from "./config.js";
import { h, clear, append, int, money, dmyTime, debounce } from "./util.js";
import { icon, createSidePanel, confirmBox, freezeColumns } from "./ui.js";
import { colDef, cellText, sortValue, compareSort } from "./cols.js";
import { createXFilter } from "./xfilter.js";
import { validateRow } from "./core/validate.js";
import * as dv from "./dv.js";

const PAGE = 200;
const GROUPABLE = ["team", "system", "paymentMethod", "companyCode", "companyName", "accountant", "requestor", "createdBy", "logBookMonth", "dueMonth", "source"];
const MONTHS = { logBookMonth: ["logBookDate", "LOG BOOK MONTH"], dueMonth: ["dueDate", "DUE MONTH"] };

export function createRecords(app) {
  const { state, toast } = app;
  let q = "";
  let groupKey = null;
  let shown = PAGE;
  let ownerId = ""; // Admin กับ Manager เลือกดูแถวของคนเดียว (พี่ปอนด์ 29/10)
  const openGroups = new Set();
  const visibleKeys = ALL_COLS.map((c) => c.key);
  // ตรึงคอลัมน์ซ้าย ค่าเริ่ม INDEX ถึง PRO NUMBER เลือกเองจากเมนูหัวคอลัมน์ได้ จำต่อเครื่อง ("-" = ไม่ตรึง) พี่ปอนด์ 29/10 รอบ 2
  const FZ = "le.freeze";
  const pref = { get: () => { try { return localStorage.getItem(FZ); } catch { return null; } }, set: (v) => { try { localStorage.setItem(FZ, v); } catch { /* ไม่มีที่เก็บ */ } } };
  let fzKey = pref.get() || "proNumber";

  const root = h("section", { id: "records", class: "page" });
  const xf = createXFilter({
    ctx: null, id: "rec", baseRows: () => searched(), columns: () => visibleKeys, onChange: () => { shown = PAGE; render(); },
    groupBy: (k) => { groupKey = k; openGroups.clear(); render(); },
    freeze: { get: () => (fzKey === "-" ? null : fzKey), set: (k) => { fzKey = k || "-"; pref.set(fzKey); render(); } },
  });
  document.body.append(xf.pop);
  const panel = createSidePanel("rec-panel", "");
  document.body.append(panel.el);

  function searched() {
    const base = ownerId && state.role !== "MEMBER" ? state.rows.filter((r) => r.ownerId === ownerId) : state.rows;
    if (!q) return base;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return base.filter((r) => {
      const hay = ALL_COLS.map((c) => cellText(c, r)).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }
  /** แถวที่เห็นตอนนี้ (ค้นหา + ตัวกรอง + เรียง) ใช้ส่งออกด้วย */
  const current = () => xf.apply(searched());

  // ---------- โครงหน้า ----------
  const search = h("input", { type: "search", id: "rec-search", class: "search", placeholder: "Search all columns", "aria-label": "Search", autocomplete: "off" });
  search.addEventListener("input", debounce(() => { q = search.value.trim(); shown = PAGE; render(); }, 200));
  const groupSel = h("select", { id: "rec-group", class: "sel", "aria-label": "Group by" },
    h("option", { value: "" }, "No grouping"),
    GROUPABLE.map((k) => h("option", { value: k }, "Group by " + (MONTHS[k] ? MONTHS[k][1] : colDef(k).t))));
  groupSel.addEventListener("change", () => { groupKey = groupSel.value || null; openGroups.clear(); render(); });
  // ช่องเลือกคน พิมพ์ค้นหาชื่อได้ (พี่ปอนด์ 30/10 ภาพ #81 ลูกทีมเยอะ ไล่หาในรายการยาวไม่ไหว)
  let owners = [];
  const ownerLabel = h("span", { class: "owner-label" }, "All people");
  const ownerBtn = h("button", { type: "button", class: "owner-btn", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": "Show rows of" }, ownerLabel, icon("chev", 14));
  const ownerQ = h("input", { type: "search", id: "rec-owner-q", placeholder: "Search people", "aria-label": "Search people", autocomplete: "off" });
  const ownerList = h("div", { class: "owner-list", role: "listbox" });
  const ownerPop = h("div", { class: "owner-pop", hidden: true }, ownerQ, ownerList);
  const ownerSel = h("div", { id: "rec-owner", class: "owner-box" }, ownerBtn, ownerPop);
  let ownerActive = 0;
  const ownerOpts = () => [...ownerList.querySelectorAll(".owner-opt")];
  function renderOwners() {
    const qq = ownerQ.value.trim().toLowerCase();
    const list = [...(qq ? [] : [{ id: "", name: "All people" }]), ...owners.filter((o) => o.name.toLowerCase().includes(qq))];
    clear(ownerList).append(...list.map((o, i) => h("button", { type: "button", class: "owner-opt" + (i === ownerActive ? " active" : ""), role: "option", "data-id": o.id,
      "aria-selected": String(o.id === ownerId), onclick: () => pickOwner(o.id) }, o.id ? `${o.name} (${int(o.n)})` : o.name)));
    if (!list.length) ownerList.append(h("div", { class: "owner-none" }, "No people found"));
  }
  function pickOwner(id) { ownerId = id; closeOwners(); ownerBtn.focus(); shown = PAGE; render(); }
  function ownerOutside(e) { if (!ownerSel.contains(e.target)) closeOwners(); }
  function closeOwners() {
    ownerPop.hidden = true; ownerBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", ownerOutside, true);
  }
  ownerBtn.addEventListener("click", () => {
    if (!ownerPop.hidden) { closeOwners(); return; }
    ownerQ.value = ""; ownerActive = 0; renderOwners();
    ownerPop.hidden = false; ownerBtn.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", ownerOutside, true);
    if (!window.matchMedia("(pointer: coarse)").matches) ownerQ.focus(); // จอสัมผัสไม่เด้งคีย์บอร์ดเอง แตะช่องค้นหาเมื่ออยากพิมพ์
  });
  ownerQ.addEventListener("input", () => { ownerActive = 0; renderOwners(); });
  ownerPop.addEventListener("keydown", (e) => {
    const opts = ownerOpts();
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeOwners(); ownerBtn.focus(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!opts.length) return;
      ownerActive = (ownerActive + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
      opts.forEach((o, i) => o.classList.toggle("active", i === ownerActive));
      opts[ownerActive].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && opts[ownerActive]) { e.preventDefault(); pickOwner(opts[ownerActive].dataset.id); }
  });
  function fillOwners() {
    const by = new Map();
    for (const r of state.rows) { const o = by.get(r.ownerId) || { id: r.ownerId, name: r.ownerName || "(Unknown)", n: 0 }; o.n++; by.set(r.ownerId, o); }
    if (ownerId && !by.has(ownerId)) ownerId = "";
    owners = [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
    const cur = by.get(ownerId);
    ownerLabel.textContent = cur ? `${cur.name} (${int(cur.n)})` : "All people";
    ownerBtn.classList.toggle("on", !!cur);
    ownerSel.hidden = state.role === "MEMBER";
    if (!ownerPop.hidden) renderOwners();
  }
  const summary = h("div", { class: "summary", id: "rec-summary", "aria-live": "polite" });
  const chips = h("div", { class: "chips", id: "rec-chips" });
  const tableWrap = h("div", { class: "table-wrap", id: "rec-table" });
  const more = h("div", { class: "more" });

  const toolbar = h("div", { class: "toolbar" },
    search, groupSel, ownerSel,
    h("span", { class: "grow" }),
    h("button", { type: "button", id: "btn-add", class: "btn primary", onclick: () => openForm(null) }, icon("plus", 16), "Add row"),
    h("button", { type: "button", id: "btn-export", class: "btn", "aria-label": "Export", onclick: () => app.openExport(current()) }, icon("upload", 16), h("span", { class: "lbl" }, "Export")),
    h("button", { type: "button", id: "btn-goto", class: "btn", title: "Go to column (Ctrl+G)", "aria-label": "Go to column", onclick: () => openGoto() }, icon("columns", 16), h("span", { class: "lbl" }, "Go to column")), // ไม่มีป้ายคีย์ลัดบนปุ่ม (พี่ปอนด์ 29/10 รอบ 4) กด Ctrl+G ได้เหมือนเดิม
    h("button", { type: "button", id: "btn-refresh", class: "btn icon", title: "Refresh", "aria-label": "Refresh", onclick: () => app.reload() }, icon("refresh", 18)));
  tableWrap.addEventListener("freeze-too-wide", () => toast.show("Those columns are too wide to freeze. Try a column further left."));
  root.append(toolbar, h("div", { class: "subbar" }, summary, chips, xf.mobileButton), tableWrap, more);
  // ไม่มีปุ่ม Show more เลื่อนใกล้ท้ายตารางแล้วโหลดเพิ่มเองทีละ 1,000 แถว (พี่ปอนด์ 29/10 ภาพ #75)
  let lastCount = 0;
  function maybeMore() {
    if (groupKey || lastCount <= shown || !root.isConnected) return;
    const nearInside = tableWrap.scrollHeight - tableWrap.scrollTop - tableWrap.clientHeight < 400;
    const nearPage = tableWrap.getBoundingClientRect().bottom - window.innerHeight < 400;
    if (nearInside && nearPage) { shown += PAGE * 5; render(); }
  }
  tableWrap.addEventListener("scroll", maybeMore, { passive: true });
  window.addEventListener("scroll", maybeMore, { passive: true });

  // ---------- วาดตาราง ----------
  function groupValue(r) {
    if (MONTHS[groupKey]) { const v = r[MONTHS[groupKey][0]]; return v ? v.slice(0, 7) : ""; }
    return cellText(colDef(groupKey), r);
  }

  // ---------- ลากขอบหัวคอลัมน์เพื่อขยายหรือหด แบบ Excel (พี่ปอนด์ 29/10 รอบ 3) ดับเบิลคลิกกลับเป็นอัตโนมัติ จำต่อเครื่อง ----------
  const WK = "le.widths";
  let widths = (() => { try { return JSON.parse(localStorage.getItem(WK) || "{}"); } catch { return {}; } })();
  const widthStyle = h("style", { id: "le-widths" });
  document.head.append(widthStyle);
  function applyWidths() {
    widthStyle.textContent = Object.entries(widths).map(([k, w]) =>
      `#rec-table th[data-col="${k}"], #rec-table td[data-c="${k}"] { width: ${w}px; min-width: ${w}px; max-width: ${w}px; }`).join("\n");
  }
  applyWidths();
  const saveWidths = () => { try { localStorage.setItem(WK, JSON.stringify(widths)); } catch { /* ไม่มีที่เก็บ */ } };
  function resizer(k) {
    const grip = h("span", { class: "col-rs", "data-rs": k, title: "Drag to resize. Double-click to auto-fit.", "aria-hidden": "true" });
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      const th = grip.closest("th");
      const x0 = e.clientX, w0 = th.getBoundingClientRect().width;
      grip.setPointerCapture(e.pointerId);
      document.body.classList.add("col-resizing");
      let moved = false, done = false;
      const move = (ev) => { moved = true; widths[k] = Math.max(48, Math.round(w0 + ev.clientX - x0)); applyWidths(); };
      // ปล่อยเมาส์ได้หลายทาง (ปล่อยนอกจอ , เสียการจับเมาส์ , ยกเลิก) ล้างทุกทาง ไม่งั้นสถานะลากค้าง (พี่ปอนด์เห็นจริง 29/10 ภาพ #68)
      const up = () => {
        if (done) return;
        done = true;
        grip.removeEventListener("pointermove", move);
        for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) grip.removeEventListener(ev, up);
        window.removeEventListener("pointerup", up);
        document.body.classList.remove("col-resizing");
        if (moved) { saveWidths(); render(); } // วัดตำแหน่งคอลัมน์ที่ตรึงใหม่ คลิกเฉย ๆ ไม่วาดใหม่ ดับเบิลคลิกจะได้โดนที่จับเดิม
      };
      grip.addEventListener("pointermove", move);
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) grip.addEventListener(ev, up);
      window.addEventListener("pointerup", up);
    });
    grip.addEventListener("click", (e) => e.stopPropagation());
    grip.addEventListener("dblclick", (e) => { e.stopPropagation(); delete widths[k]; applyWidths(); saveWidths(); render(); });
    return grip;
  }

  function headRow() {
    return h("tr", null, visibleKeys.map((k) => {
      const c = colDef(k);
      return h("th", { class: (c.num ? "num " : "") + (c.input === "auto" ? "auto" : ""), "data-col": k, scope: "col" },
        h("span", { class: "th-in" }, h("span", { class: "th-t" }, c.t), xf.headerButton(c)), resizer(k));
    }));
  }

  function rowEl(r) {
    return h("tr", { "data-id": r.id, tabindex: "0", onclick: () => openDetail(r), onkeydown: (e) => { if (e.key === "Enter") openDetail(r); } },
      visibleKeys.map((k) => {
        const c = colDef(k);
        if (k === "edits") {
          const n = state.edits.get(r.id) || 0;
          return h("td", { class: "num" }, n ? h("button", { type: "button", class: "link hist-n", "data-hist": r.id, title: "View history",
            onclick: (e) => { e.stopPropagation(); openDetail(r, true); } }, `${int(n)} edit${n > 1 ? "s" : ""}`) : h("span", { class: "faint" }, "No edits"));
        }
        const t = cellText(c, r);
        return h("td", { "data-c": k, class: c.num ? "num" : c.kind === "date" || c.kind === "datetime" ? "nowrap" : "", title: t.length > 24 ? t : null }, t);
      }));
  }

  function render() {
    fillOwners();
    const rows = current();
    lastCount = rows.length;
    const total = rows.reduce((a, r) => a + (Number(r.amount) || 0), 0);
    clear(summary).append(h("b", null, int(rows.length)), ` of ${int(state.rows.length)} rows`, h("span", { class: "sep" }), "AMOUNT ", h("b", null, money(total)));
    clear(chips);
    for (const c of xf.chips()) chips.append(h("span", { class: "chip" }, c.label, h("button", { type: "button", class: "chip-x", "aria-label": "Remove " + c.label, onclick: c.remove }, icon("close", 12))));
    if (groupKey) chips.append(h("span", { class: "chip" }, "Group " + (MONTHS[groupKey] ? MONTHS[groupKey][1] : colDef(groupKey).t),
      h("button", { type: "button", class: "chip-x", "aria-label": "Remove grouping", onclick: () => { groupKey = null; groupSel.value = ""; render(); } }, icon("close", 12))));
    if (xf.active || q || ownerId) chips.append(h("button", { type: "button", class: "btn link sm", id: "rec-clear", onclick: () => { xf.clear(); q = ""; search.value = ""; ownerId = ""; render(); } }, "Clear all filters"));
    groupSel.value = groupKey || "";

    const body = h("tbody");
    clear(more);
    if (!rows.length) {
      body.append(h("tr", null, h("td", { colspan: visibleKeys.length, class: "empty" }, state.rows.length ? "No rows match the filters" : "No data yet. Add a row, or import a file on the Import tab.")));
    } else if (groupKey) {
      const groups = new Map();
      for (const r of rows) { const g = groupValue(r); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); }
      const keys = [...groups.keys()].sort((a, b) => compareSort(a || null, b || null));
      for (const g of keys) {
        const list = groups.get(g);
        const open = openGroups.has(g);
        const sum = list.reduce((a, r) => a + (Number(r.amount) || 0), 0);
        body.append(h("tr", { class: "grp", "data-group": g },
          h("td", { colspan: visibleKeys.length },
            h("button", { type: "button", class: "grp-btn", "aria-expanded": String(open), onclick: () => { if (open) openGroups.delete(g); else openGroups.add(g); render(); } },
              h("span", { class: "chev" + (open ? " open" : "") }, icon("chev", 14)), h("b", null, g || "(Blank)"),
              h("span", { class: "grp-n" }, `${int(list.length)} rows`), h("span", { class: "grp-sum" }, "AMOUNT ", h("b", null, money(sum)))))));
        if (open) for (const r of list.slice(0, 500)) body.append(rowEl(r));
        if (open && list.length > 500) body.append(h("tr", null, h("td", { colspan: visibleKeys.length, class: "faint" }, `Showing 500 of ${int(list.length)} rows. Filter further to see the rest.`)));
      }
    } else {
      for (const r of rows.slice(0, shown)) body.append(rowEl(r));
      if (rows.length > shown) body.append(h("tr", { class: "more-row" }, h("td", { colspan: visibleKeys.length, class: "faint" }, "Scroll down to load more rows")));
    }
    const sx = tableWrap.scrollLeft;
    const table = h("table", { class: "grid" }, h("thead", null, headRow()), body);
    clear(tableWrap).append(table);
    freezeColumns(table, fzKey === "-" ? null : fzKey, pref.get() ? 0.85 : 0.5); // เลือกเองยอมตรึงกว้างได้ถึง 85% ของกรอบ
    tableWrap.scrollLeft = sx;
  }

  // ---------- รายละเอียด + ประวัติ ----------
  async function openDetail(r, focusHistory = false) {
    panel.titleEl.textContent = `INDEX ${r.index ?? ""}  ${r.proNumber}`;
    panel.subEl.textContent = r.name;
    clear(panel.body);
    const dl = h("dl", { class: "kv" });
    for (const c of ALL_COLS) { if (c.key === "edits") continue; dl.append(h("dt", null, c.t), h("dd", null, cellText(c, r) || h("span", { class: "faint" }, "Blank"))); }
    const hist = h("div", { class: "hist", id: "hist-list" }, h("div", { class: "faint" }, "Loading history"));
    panel.body.append(h("h3", { class: "sp-h" }, "Change history"), hist, h("h3", { class: "sp-h" }, "Row details"), dl);
    append(clear(panel.foot), [
      state.role === "ADMIN" ? h("button", { type: "button", class: "btn danger", id: "btn-del-one", onclick: () => removeOne(r) }, icon("trash", 16), "Delete row") : null,
      h("span", { class: "grow" }),
      h("button", { type: "button", class: "btn primary", id: "btn-edit", onclick: () => openForm(r) }, icon("edit", 16), "Edit")]);
    panel.open();
    try {
      const list = await dv.historyOf(r.id);
      clear(hist);
      hist.append(h("div", { class: "hist-item" }, h("div", { class: "hist-head" }, h("b", null, "Created"), h("span", { class: "faint" }, `${dmyTime(r.createdOn)}  ${r.createdBy}`)),
        r.source && r.source !== "Manual" ? h("div", { class: "faint" }, "From file " + r.source) : null));
      for (const it of list.reverse()) {
        hist.append(h("div", { class: "hist-item" },
          h("div", { class: "hist-head" }, h("b", null, "Edited"), h("span", { class: "faint" }, `${dmyTime(it.at)}  ${it.by}`)),
          h("table", { class: "diff" }, it.changes.map((c) => h("tr", null, h("th", null, c.t), h("td", { class: "from" }, c.from || "(blank)"), h("td", { class: "arrow" }, "→"), h("td", { class: "to" }, c.to || "(blank)"))))));
      }
      if (focusHistory) hist.scrollIntoView({ block: "start" });
    } catch (e) { clear(hist).append(h("div", { class: "err" }, "Could not load history: " + e.message)); }
  }

  async function removeOne(r) {
    if (!(await confirmBox(document.body, { title: "Delete this row", body: `INDEX ${r.index} ${r.proNumber} and its history will be deleted permanently.`, ok: "Delete", cancel: "Cancel" }))) return;
    try {
      await dv.deleteOne(r.id);
      state.rows = state.rows.filter((x) => x.id !== r.id);
      panel.close();
      render();
      toast.show("Deleted", { kind: "success" });
    } catch (e) { toast.show(e.message, { kind: "error" }); }
  }

  // ---------- ฟอร์มเพิ่มและแก้ ----------
  function control(f, val) {
    const id = "f-" + f.key;
    if (f.kind === "choice") {
      const s = h("select", { id, name: f.key, class: "sel" }, h("option", { value: "" }, f.input === "required" ? "Select" : "(Blank)"), f.options.map((o) => h("option", { value: o }, o)));
      s.value = val || "";
      return s;
    }
    if (f.kind === "date") return h("input", { id, name: f.key, type: "text", inputmode: "numeric", placeholder: "dd/mm/yyyy", value: val ? val.slice(8, 10) + "/" + val.slice(5, 7) + "/" + val.slice(0, 4) : "", autocomplete: "off" });
    if (f.kind === "num") return h("input", { id, name: f.key, type: "text", inputmode: "decimal", value: val === null || val === undefined ? "" : String(val), autocomplete: "off" });
    if (f.key === "remark") return h("textarea", { id, name: f.key, rows: 3, maxlength: f.max }, val || "");
    return h("input", { id, name: f.key, type: "text", maxlength: f.max, value: val || "", autocomplete: "off" });
  }

  function openForm(r) {
    panel.titleEl.textContent = r ? `Edit INDEX ${r.index}` : "Add row";
    panel.subEl.textContent = r ? r.proNumber : "* Required. AUTO columns are filled in by the system.";
    clear(panel.body);
    const form = h("form", { id: "rec-form", class: "form", novalidate: true });
    const errs = new Map();
    for (const f of INPUT_FIELDS) {
      const ctl = control(f, r ? r[f.key] : "");
      const er = h("div", { class: "ferr", id: "e-" + f.key, role: "alert" });
      errs.set(f.key, er);
      form.append(h("div", { class: "field" }, h("label", { class: "flabel", for: ctl.id }, f.t, f.input === "required" ? h("span", { class: "req" }, " *") : null), ctl, er));
    }
    const autoNote = h("div", { class: "auto-note", id: "auto-note" });
    form.append(autoNote);
    const read = () => Object.fromEntries(INPUT_FIELDS.map((f) => [f.key, form.elements[f.key].value]));
    const preview = () => {
      const { values } = validateRow(read());
      clear(autoNote).append(h("div", null, "SITE CODE NO CANDIDATE: ", h("b", null, values.siteCodeNoCand || "-")), h("div", null, "COMPANY NAME: ", h("b", null, values.companyName || "-")));
    };
    form.addEventListener("input", preview);
    preview();
    const saveBtn = h("button", { type: "submit", form: "rec-form", class: "btn primary", id: "btn-save" }, "Save");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const { values, errors } = validateRow(read());
      for (const er of errs.values()) er.textContent = "";
      for (const x of errors) errs.get(x.key).textContent = x.msg;
      if (errors.length) { form.elements[errors[0].key].focus(); return; }
      saveBtn.disabled = true;
      try {
        if (!r) {
          const row = await dv.createOne(values);
          state.rows.unshift(row);
          toast.show(`Added INDEX ${row.index}`, { kind: "success" });
          panel.close();
        } else {
          const changes = [];
          for (const f of FIELDS) {
            if (f.key === "index") continue;
            const a = cellText(colDef(f.key), r), b = cellText(colDef(f.key), values);
            if (a !== b) changes.push({ k: f.key, t: f.t, from: a, to: b });
          }
          if (!changes.length) { toast.show("Nothing changed"); panel.close(); return; }
          const row = await dv.updateOne(r, values, changes);
          state.rows = state.rows.map((x) => (x.id === r.id ? row : x));
          state.edits.set(r.id, (state.edits.get(r.id) || 0) + 1);
          toast.show(`Saved INDEX ${row.index}, ${changes.length} field${changes.length > 1 ? "s" : ""} changed`, { kind: "success" });
          openDetail(row);
        }
        render();
      } catch (err) { toast.show(err.message, { kind: "error", ms: 10000 }); }
      finally { saveBtn.disabled = false; }
    });
    panel.body.append(form);
    clear(panel.foot).append(h("span", { class: "grow" }), h("button", { type: "button", class: "btn", onclick: () => (r ? openDetail(r) : panel.close()) }, "Cancel"), saveBtn);
    panel.open();
    form.elements[INPUT_FIELDS[0].key].focus();
  }

  // ---------- Go to column แบบ Power Query (Ctrl+G) พี่ปอนด์ 29/10 รอบ 2 ----------
  function scrollToCol(key) {
    const th = tableWrap.querySelector(`th[data-col="${key}"]`);
    if (!th) return;
    const frozen = [...tableWrap.querySelectorAll("thead th.frz")].reduce((a, x) => a + x.getBoundingClientRect().width, 0);
    tableWrap.scrollLeft = th.classList.contains("frz") ? 0 : Math.max(0, th.offsetLeft - frozen - 8);
    const i = [...th.parentElement.children].indexOf(th);
    const cells = [th, ...[...tableWrap.querySelectorAll("tbody tr[data-id]")].map((tr) => tr.children[i]).filter(Boolean)];
    // เลือกค้างแบบ Excel (เขียวอ่อน) จนกว่าจะคลิกที่อื่น พี่ปอนด์ 29/10 รอบ 3
    for (const x of tableWrap.querySelectorAll(".col-flash")) x.classList.remove("col-flash");
    for (const c of cells) c.classList.add("col-flash");
    setTimeout(() => document.addEventListener("pointerdown", () => cells.forEach((c) => c.classList.remove("col-flash")), { once: true, capture: true }), 0);
    th.querySelector(".xf-btn")?.focus({ preventScroll: true });
  }
  let gotoDlg = null;
  function openGoto() {
    if (gotoDlg) gotoDlg.remove();
    let az = false, pick = 0;
    const input = h("input", { type: "search", id: "goto-q", class: "search", placeholder: "Column name", "aria-label": "Column name", autocomplete: "off" });
    const sortBtn = h("button", { type: "button", class: "btn icon sm", id: "goto-az", title: "Sort A to Z", "aria-pressed": "false" }, "A↓Z");
    const list = h("div", { class: "goto-list", role: "listbox", id: "goto-list" });
    const shown = () => {
      const q = input.value.trim().toLowerCase();
      const cols = ALL_COLS.filter((c) => !q || c.t.toLowerCase().includes(q));
      return az ? [...cols].sort((a, b) => a.t.localeCompare(b.t)) : cols;
    };
    const draw = () => {
      const cols = shown();
      pick = Math.min(pick, Math.max(0, cols.length - 1));
      clear(list);
      cols.forEach((c, i) => list.append(h("button", { type: "button", role: "option", class: "goto-item" + (i === pick ? " on" : ""), "aria-selected": String(i === pick), "data-col": c.key,
        onclick: () => go(c.key), onmousemove: () => { if (pick !== i) { pick = i; draw(); } } }, c.t)));
      if (!cols.length) list.append(h("div", { class: "faint goto-none" }, "No matching column"));
      list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
    };
    const go = (key) => { if (!key) return; gotoDlg.close(); scrollToCol(key); };
    input.addEventListener("input", () => { pick = 0; draw(); });
    input.addEventListener("keydown", (e) => {
      const n = shown().length;
      if (e.key === "ArrowDown") { e.preventDefault(); pick = Math.min(n - 1, pick + 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); pick = Math.max(0, pick - 1); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); go(shown()[pick]?.key); }
    });
    sortBtn.addEventListener("click", () => { az = !az; sortBtn.setAttribute("aria-pressed", String(az)); draw(); input.focus(); });
    gotoDlg = h("dialog", { class: "dlg goto", id: "goto-dlg", "aria-labelledby": "goto-title" },
      h("h2", { id: "goto-title" }, "Go to column"),
      h("div", { class: "goto-bar" }, input, sortBtn), list,
      h("div", { class: "dlg-foot" }, h("button", { type: "button", class: "btn", onclick: () => gotoDlg.close() }, "Cancel"),
        h("button", { type: "button", class: "btn dark", id: "goto-ok", onclick: () => go(shown()[pick]?.key) }, "OK")));
    gotoDlg.addEventListener("close", () => { gotoDlg.remove(); gotoDlg = null; });
    document.body.append(gotoDlg);
    gotoDlg.showModal();
    draw();
    input.focus();
  }
  // Ctrl+G เปิดเฉพาะตอนหน้า Records อยู่บนจอ (Chrome ใช้ Ctrl+G เป็นค้นต่อ จึงกันค่าเดิมไว้)
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "g" && root.isConnected) { e.preventDefault(); openGoto(); }
  });

  return { el: root, render, current, closePanel: () => panel.close() };
}
