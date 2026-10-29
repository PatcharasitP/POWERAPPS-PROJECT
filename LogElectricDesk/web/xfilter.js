// xfilter.js · ตัวกรองแบบ Excel ที่หัวคอลัมน์ (ยกมาจาก Pending VAT Desk): เรียง, ค้นหา, ติ๊กเลือกค่า, เงื่อนไขข้อความและตัวเลข, Group by จากหัวคอลัมน์
// ค่าในรายการคิดจากแถวที่ผ่านตัวกรองคอลัมน์อื่นแล้ว (แบบ Excel) มือถือไม่มีหัวตาราง ใช้ปุ่ม "กรองตามคอลัมน์" แทน
import { h, clear, int } from "./util.js";
import { icon } from "./ui.js";
import { colDef, cellText, sortValue, compareSort } from "./cols.js";

const BLANK = "(Blanks)";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LIST_MAX = 1000;

// ตัวกรองแบบเงื่อนไข เหมือน Text Filters กับ Number Filters ของ Excel (พี่ปอนด์ 20/10) ข้อความไม่สนตัวเล็กใหญ่
const TEXT_OPS = [["eq", "Equals"], ["ne", "Does not equal"], ["begins", "Begins with"], ["ends", "Ends with"], ["contains", "Contains"], ["notContains", "Does not contain"]];
const NUM_OPS = [["eq", "Equals"], ["ne", "Does not equal"], ["gt", "Greater than"], ["ge", "Greater than or equal to"], ["lt", "Less than"], ["le", "Less than or equal to"]];
const OP_LABEL = Object.fromEntries([...TEXT_OPS, ...NUM_OPS]);
const toNum = (v) => { const x = Number(String(v ?? "").replace(/,/g, "").trim()); return String(v ?? "").trim() === "" || !Number.isFinite(x) ? null : x; };

function testOne({ op, v }, text, num) {
  if (num !== undefined) { // คอลัมน์ตัวเลข เทียบเป็นตัวเลข
    const x = toNum(v);
    if (x === null) return true;
    if (num === null) return op === "ne";
    return { eq: num === x, ne: num !== x, gt: num > x, ge: num >= x, lt: num < x, le: num <= x }[op] ?? true;
  }
  const t = text.toLowerCase(), w = String(v ?? "").trim().toLowerCase();
  return { eq: t === w, ne: t !== w, begins: t.startsWith(w), ends: t.endsWith(w), contains: t.includes(w), notContains: !t.includes(w) }[op] ?? true;
}

/**
 * createXFilter({ctx, id, baseRows: () => rows, columns: () => keys, onChange})
 * คืน {apply(rows), headerButton(col), mobileButton, pop, chips(), clear(), active}
 */
export function createXFilter({ ctx, id, baseRows, columns, onChange, groupBy = null, canGroup = null, freeze = null }) {
  const filters = new Map(); // key -> Set ของข้อความที่ให้ผ่าน
  let sort = null; // {key, dir: 1|-1}
  const pop = h("div", { id: `${id}-xf`, class: "xf-pop", role: "dialog", "aria-label": "Column filter", hidden: true });
  const textOf = (c, r) => { const t = cellText(c, r, ctx); return t === "" ? BLANK : t; };

  // ค่าใน filters: Set ของข้อความที่ติ๊ก หรือ {a, b, join} ตัวกรองเงื่อนไข
  function condPass(f, c, r) {
    const t = cellText(c, r, ctx);
    const n = c.num ? toNum(sortValue(c, r, ctx)) : undefined;
    const a = testOne(f.a, t, n);
    if (!f.b) return a;
    const b = testOne(f.b, t, n);
    return f.join === "or" ? a || b : a && b;
  }
  function passes(r, except) {
    for (const [k, allowed] of filters) {
      if (k === except) continue;
      const c = colDef(k);
      if (allowed instanceof Set ? !allowed.has(textOf(c, r)) : !condPass(allowed, c, r)) return false;
    }
    return true;
  }

  function apply(rows, except = null) {
    let out = filters.size ? rows.filter((r) => passes(r, except)) : rows;
    if (sort && except === null) {
      const c = colDef(sort.key);
      out = out.map((r) => [sortValue(c, r, ctx), r]).sort((a, b) => {
        if (a[0] === null || b[0] === null) return compareSort(a[0], b[0]); // ว่างไว้ท้ายทั้งสองทิศ
        return compareSort(a[0], b[0]) * sort.dir;
      }).map((x) => x[1]);
    }
    return out;
  }

  // ---------- หน้าต่างตัวกรอง ----------
  let anchor = null;
  function close() {
    pop.hidden = true;
    clear(pop);
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", onEsc, true);
    if (anchor && anchor.isConnected) anchor.focus({ preventScroll: true });
    anchor = null;
  }
  function outside(e) { if (!pop.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); }
  function onEsc(e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }

  function place(el) {
    if (window.matchMedia("(max-width: 639px)").matches || !el) { pop.classList.add("sheet"); pop.style.left = pop.style.top = pop.style.bottom = pop.style.maxHeight = ""; return; }
    pop.classList.remove("sheet");
    // หัวคอลัมน์อยู่นอกจอ (เลื่อนลงมาแล้ว) ให้เลื่อนกลับมาก่อน แล้ววางใต้หัว ที่ใต้หัวไม่พอให้กลับขึ้นข้างบน ไม่ให้ล้นจอ
    if (el.getBoundingClientRect().bottom > window.innerHeight - 40 || el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const w = 380;
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + "px";
    fit(r.bottom + 4);
  }

  /**
   * แบบ Excel (พี่ปอนด์ 29/10 ภาพ #73): กล่องเริ่มใต้หัวคอลัมน์ ยืดได้ถึงขอบจอล่าง ตัวกล่องไม่เลื่อน รายการค่าหดหรือเลื่อนแทน
   * ใต้หัวเหลือที่ไม่พอให้รายการเห็นอย่างน้อย 200px ค่อยขยับกล่องขึ้น (เดิมตั้งสูงสุด 620px ตายตัว จอ 900 กล่องเลื่อนทั้งที่ข้างล่างว่าง)
   */
  function fit(top0) {
    const vh = window.innerHeight;
    const list = pop.querySelector(".xf-list");
    pop.style.bottom = ""; pop.style.maxHeight = "none"; pop.style.top = top0 + "px";
    const natural = pop.offsetHeight;
    const listH = list ? list.offsetHeight : 0, listContent = list ? list.scrollHeight : 0;
    const need = natural - listH + Math.min(listContent, 200); // ความสูงเมื่อรายการหดเหลือ 200 (หรือเท่าที่มี)
    const top = top0 + need <= vh - 8 ? top0 : Math.max(8, vh - 8 - Math.min(natural, vh - 16));
    pop.style.top = top + "px";
    pop.style.maxHeight = vh - top - 8 + "px";
  }

  /** รายการเปลี่ยนหลังเปิด (กางเดือน , ค้นหา) วางใหม่ให้พอดีจอ (เห็นปุ่ม OK โดนตัด 29/10) */
  function refit() {
    if (pop.hidden || pop.classList.contains("sheet") || !anchor) return;
    fit(anchor.getBoundingClientRect().bottom + 4);
  }

  function show(el) {
    anchor = el;
    pop.hidden = false;
    place(el);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onEsc, true);
  }

  /** เปิดตัวกรองของคอลัมน์ key */
  function openFor(key, el) {
    const c = colDef(key);
    const rows = apply(baseRows(), key);
    const counts = new Map();
    const sv = new Map();
    for (const r of rows) {
      const t = textOf(c, r);
      counts.set(t, (counts.get(t) || 0) + 1);
      if (!sv.has(t)) sv.set(t, sortValue(c, r, ctx));
    }
    const values = [...counts.keys()].sort((a, b) => compareSort(sv.get(a), sv.get(b)));
    const cur = filters.get(key);
    const curCond = cur && !(cur instanceof Set) ? cur : null;
    // กรองแบบเงื่อนไขอยู่ ติ๊กเฉพาะค่าที่ผ่านเงื่อนไข (แบบ Excel)
    const passText = (v) => curCond ? rows.some((r) => textOf(c, r) === v && condPass(curCond, c, r)) : cur.has(v);
    const draft = new Set(cur ? values.filter(passText) : values);
    let q = "";

    const listEl = h("div", { class: "xf-list", role: "group", "aria-label": `Values in ${c.t}` });
    const allCb = h("input", { type: "checkbox", class: "xf-all" });
    const allText = h("span", null, "(Select All)");
    const moreEl = h("div", { class: "fhint" });
    const ok = h("button", { type: "button", class: "btn dark sm xf-ok" }, "OK");
    const visible = () => (q ? values.filter((v) => v.toLowerCase().includes(q)) : values);
    // คอลัมน์วันที่ แสดงเป็นต้นไม้ ปี > เดือน > วัน แบบ Excel ชื่อเดือนภาษาอังกฤษ (พี่ปอนด์ 29/10 รอบ 4) ค้นหาแล้วกลับเป็นรายการเรียบ
    const isDate = c.kind === "date" || c.kind === "datetime";
    const tree = new Map(); // ปี -> เดือน -> วัน -> [ข้อความในรายการ]
    const blanks = [];
    if (isDate) {
      for (const v of values) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
        if (!m) { blanks.push(v); continue; }
        const [, d, mo, y] = m;
        if (!tree.has(y)) tree.set(y, new Map());
        const ym = tree.get(y);
        if (!ym.has(mo)) ym.set(mo, new Map());
        const md = ym.get(mo);
        if (!md.has(d)) md.set(d, []);
        md.get(d).push(v);
      }
    }
    const open = new Set([...tree.keys()].map((y) => "y:" + y)); // ปีกางไว้ เดือนพับไว้ (แบบ Excel)
    const flat = (node) => (Array.isArray(node) ? node : [...node.values()].flatMap(flat));
    function treeRow(depth, id, label, texts, kids) {
      const n = texts.filter((t) => draft.has(t)).length;
      const cb = h("input", { type: "checkbox", "data-node": id });
      cb.checked = n === texts.length; cb.indeterminate = n > 0 && n < texts.length;
      cb.addEventListener("change", () => { for (const t of texts) { if (cb.checked) draft.add(t); else draft.delete(t); } renderList(); });
      const tog = kids ? h("button", { type: "button", class: "xf-tog", "data-tog": id, "aria-expanded": String(open.has(id)), "aria-label": (open.has(id) ? "Collapse " : "Expand ") + label,
        onclick: () => { if (open.has(id)) open.delete(id); else open.add(id); renderList(); } }, icon("chev", 14)) : h("span", { class: "xf-tog" });
      const total = texts.reduce((a, t) => a + (counts.get(t) || 0), 0);
      listEl.append(h("div", { class: "xf-tree", style: `padding-left:${depth * 18}px` }, tog,
        h("label", { class: "switch xf-item" }, cb, h("span", { class: "xf-v" }, label), h("span", { class: "xf-n" }, int(total)))));
    }
    function renderTree() {
      for (const [y, months] of tree) {
        treeRow(0, "y:" + y, y, flat(months), true);
        if (!open.has("y:" + y)) continue;
        for (const [mo, days] of months) {
          const mid = `m:${y}-${mo}`;
          treeRow(1, mid, MONTHS[Number(mo) - 1], flat(days), true);
          if (!open.has(mid)) continue;
          for (const [d, texts] of days) treeRow(2, `d:${y}-${mo}-${d}`, String(Number(d)), texts, false);
        }
      }
      if (blanks.length) treeRow(0, "blank", BLANK, blanks, false);
    }

    function renderList() {
      clear(listEl);
      const vis = visible();
      const n = vis.filter((v) => draft.has(v)).length;
      allCb.checked = vis.length > 0 && n === vis.length;
      allCb.indeterminate = n > 0 && n < vis.length;
      allText.textContent = q ? "(Select all results)" : "(Select All)";
      if (isDate && !q) {
        renderTree();
        moreEl.textContent = "";
        ok.disabled = draft.size === 0;
        refit();
        return;
      }
      for (const v of vis.slice(0, LIST_MAX)) {
        const cb = h("input", { type: "checkbox", "data-v": v });
        cb.checked = draft.has(v);
        cb.addEventListener("change", () => { if (cb.checked) draft.add(v); else draft.delete(v); renderList(); });
        listEl.append(h("label", { class: "switch xf-item" }, cb, h("span", { class: "xf-v" }, v), h("span", { class: "xf-n" }, int(counts.get(v)))));
      }
      moreEl.textContent = vis.length > LIST_MAX ? `Showing ${int(LIST_MAX)} of ${int(vis.length)} values. Search to find the rest.` : vis.length === 0 ? "No matching values" : "";
      ok.disabled = (q ? vis.filter((v) => draft.has(v)) : [...draft]).length === 0;
      refit();
    }
    allCb.addEventListener("change", () => { for (const v of visible()) { if (allCb.checked) draft.add(v); else draft.delete(v); } renderList(); });

    const search = h("input", { type: "search", class: "xf-search", placeholder: "Search", "aria-label": `Search values in ${c.t}`, autocomplete: "off" });
    search.addEventListener("input", () => { q = search.value.trim().toLowerCase(); renderList(); });
    search.addEventListener("keydown", (e) => { if (e.key === "Enter" && !ok.disabled) { e.preventDefault(); ok.click(); } });

    const asc = c.num ? "Sort smallest to largest" : "Sort A to Z";
    const desc = c.num ? "Sort largest to smallest" : "Sort Z to A";
    const sortBtn = (dir, label) => h("button", { type: "button", class: "xf-act" + (sort && sort.key === key && sort.dir === dir ? " on" : ""), "data-sort": dir === 1 ? "asc" : "desc",
      onclick: () => { sort = sort && sort.key === key && sort.dir === dir ? null : { key, dir }; close(); onChange(); } }, label);

    ok.addEventListener("click", () => {
      const pick = q ? visible().filter((v) => draft.has(v)) : values.filter((v) => draft.has(v));
      if (pick.length === values.length) filters.delete(key); else filters.set(key, new Set(pick));
      close();
      onChange();
    });

    // เมนูตัวกรองข้อความหรือตัวเลข กางในที่ (ไม่เป็นเมนูลอยซ้อน ใช้บนมือถือได้)
    const ops = c.num ? [...NUM_OPS, ["between", "Between"]] : TEXT_OPS;
    const sub = h("div", { class: "xf-sub", hidden: true }, [...ops, ["custom", "Custom"]].map(([op, t]) =>
      h("button", { type: "button", class: "xf-act", "data-op": op, onclick: () => openCond(key, el, op) }, t)));
    const condMenu = h("button", { type: "button", class: "xf-act xf-cond-menu" + (curCond ? " on" : ""), "aria-expanded": "false",
      onclick: () => { sub.hidden = !sub.hidden; condMenu.setAttribute("aria-expanded", String(!sub.hidden)); } },
      c.num ? "Number filters" : "Text filters", curCond ? h("span", { class: "xf-on" }, " (active)") : null, icon("chev", 14));

    clear(pop);
    pop.append(
      h("div", { class: "xf-head" }, h("b", null, c.t), h("button", { type: "button", class: "btn icon sm", "aria-label": "Close", onclick: close }, icon("close", 16))),
      sortBtn(1, asc), sortBtn(-1, desc),
      h("button", { type: "button", class: "xf-act", disabled: !filters.has(key), onclick: () => { filters.delete(key); close(); onChange(); } }, `Clear filter from ${c.t}`),
      condMenu, sub,
      // จัดกลุ่มกับตรึงคอลัมน์จากหัวคอลัมน์ได้เลย แบบ Freeze Panes ของ Excel (พี่ปอนด์ 20/10) ของที่มีเงื่อนไขใช้สเปรด null ใน append ขึ้นคำว่า null บนจอ
      ...(groupBy && (!canGroup || canGroup()) ? [h("button", { type: "button", class: "xf-act", "data-groupby": key, onclick: () => { close(); groupBy(key); } }, "Group by this column")] : []),
      ...(freeze ? [h("button", { type: "button", class: "xf-act", "data-freeze": key, onclick: () => { close(); freeze.set(key); } }, freeze.get() === key ? "Freeze up to this column (frozen)" : "Freeze up to this column")] : []),
      ...(freeze && freeze.get() ? [h("button", { type: "button", class: "xf-act", "data-unfreeze": "", onclick: () => { close(); freeze.set(null); } }, "Unfreeze columns")] : []),
      search,
      h("label", { class: "switch xf-item xf-allrow" }, allCb, allText),
      listEl, moreEl,
      h("div", { class: "xf-foot" }, h("button", { type: "button", class: "btn sm", onclick: close }, "Cancel"), ok));
    renderList();
    show(el);
    // จอเตี้ยหรือจอแคบ (มือถือ) เมนูกินที่จนค่าให้ติ๊กจมใต้ปุ่ม OK เลื่อนกล่องให้ช่อง Search อยู่บนสุด เห็นค่าทันที เมนูเรียงอยู่ข้างบนเลื่อนขึ้นไปหาได้ (30/10 มือถือแนวนอนเห็น 0 ค่า)
    if (window.matchMedia("(max-height: 500px), (max-width: 639px)").matches) pop.scrollTop = search.offsetTop - 8;
    // จอสัมผัสไม่โฟกัสเอง ไม่งั้นคีย์บอร์ดเด้งขึ้นมาบังรายการทุกครั้งที่เปิด
    if (!window.matchMedia("(max-width: 639px), (pointer: coarse)").matches) search.focus({ preventScroll: true });
  }

  /** หน้าต่างเงื่อนไข (Custom AutoFilter ของ Excel): 2 เงื่อนไข เชื่อมด้วย และ หรือ */
  function openCond(key, el, op) {
    const c = colDef(key);
    const ops = c.num ? NUM_OPS : TEXT_OPS;
    const cur = filters.get(key);
    const prev = cur && !(cur instanceof Set) ? cur : null;
    let a = prev ? prev.a : { op: ops[0][0], v: "" }, b = prev ? prev.b : null, join = prev ? prev.join : "and";
    if (op === "between") { a = { op: "ge", v: "" }; b = { op: "le", v: "" }; join = "and"; }
    else if (op !== "custom") { a = { op, v: prev && prev.a.op === op ? prev.a.v : "" }; b = null; join = "and"; }
    const sel = (cls, val, withNone) => {
      const s = h("select", { class: cls, "aria-label": "Condition" }, withNone ? h("option", { value: "" }, "None") : null, ops.map(([o, t]) => h("option", { value: o }, t)));
      s.value = val || "";
      return s;
    };
    const inp = (cls, val) => h("input", { type: "text", class: cls, value: val || "", autocomplete: "off", inputmode: c.num ? "decimal" : null, "aria-label": "Value" });
    const op1 = sel("xf-op1", a.op), v1 = inp("xf-v1", a.v), op2 = sel("xf-op2", b ? b.op : "", true), v2 = inp("xf-v2", b ? b.v : "");
    const radio = (val, t) => { const r = h("input", { type: "radio", name: "xf-join", value: val }); r.checked = join === val; return h("label", { class: "switch" }, r, t); };
    const ok = h("button", { type: "button", class: "btn dark sm xf-ok", onclick: () => {
      const first = { op: op1.value, v: v1.value.trim() };
      const second = op2.value && v2.value.trim() !== "" ? { op: op2.value, v: v2.value.trim() } : null;
      if (first.v === "" && !second) filters.delete(key);
      else filters.set(key, first.v === "" ? { a: second, b: null, join: "and" } : { a: first, b: second, join: pop.querySelector("input[name=xf-join]:checked")?.value || "and" });
      close();
      onChange();
    } }, "OK");
    for (const i of [v1, v2]) i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ok.click(); } });
    clear(pop);
    pop.append(
      h("div", { class: "xf-head" }, h("b", null, `Show rows where ${c.t}`), h("button", { type: "button", class: "btn icon sm", "aria-label": "Close", onclick: close }, icon("close", 16))),
      h("div", { class: "xf-cond" },
        h("div", { class: "xf-crow" }, op1, v1),
        h("div", { class: "row xf-join" }, radio("and", "And"), radio("or", "Or")),
        h("div", { class: "xf-crow" }, op2, v2),
        ),
      h("div", { class: "xf-foot" }, h("button", { type: "button", class: "btn sm", onclick: () => openFor(key, el) }, "Back"), ok));
    show(el);
    v1.focus({ preventScroll: true });
  }

  /** มือถือ: เลือกคอลัมน์ก่อน */
  function openMenu(el) {
    clear(pop);
    pop.append(
      h("div", { class: "xf-head" }, h("b", null, "Column filters"), h("button", { type: "button", class: "btn icon sm", "aria-label": "Close", onclick: close }, icon("close", 16))),
      h("div", { class: "xf-list" }, columns().map((k) => {
        const c = colDef(k);
        return h("button", { type: "button", class: "xf-act xf-col", "data-col": k, onclick: () => openFor(k, el) },
          c.t, filters.has(k) || (sort && sort.key === k) ? h("span", { class: "xf-on" }, " (active)") : null);
      })));
    show(el);
  }

  function headerButton(c) {
    const on = filters.has(c.key);
    const s = sort && sort.key === c.key ? sort.dir : 0;
    const b = h("button", { type: "button", class: "xf-btn" + (on || s ? " on" : ""), "data-col": c.key, "aria-label": `Filter ${c.t}${on ? " (filtered)" : ""}`, title: on ? "Filtered" : "Filter and sort",
      onclick: (e) => { e.stopPropagation(); if (!pop.hidden && anchor === b) close(); else openFor(c.key, b); } },
      s ? h("span", { class: "xf-sort", "aria-hidden": "true" }, s === 1 ? "↑" : "↓") : null, icon("funnel", 14)); // ลูกศรลอยมุมปุ่ม ไม่กินความกว้าง เรียงแล้วคอลัมน์ไม่เด้ง
    return b;
  }

  const mobileButton = h("button", { id: `${id}-xf-mobile`, type: "button", class: "btn sm m-only", onclick: (e) => openMenu(e.currentTarget) }, icon("funnel", 16), "Column filters");

  function chips() {
    const out = [];
    for (const [k, f] of filters) {
      const c = colDef(k);
      let label;
      if (f instanceof Set) { const vals = [...f]; label = `${c.t} ${vals.length === 1 ? vals[0] : int(vals.length) + " values"}`; }
      else label = `${c.t} ${OP_LABEL[f.a.op]} ${f.a.v}${f.b ? ` ${f.join === "or" ? "or" : "and"} ${OP_LABEL[f.b.op]} ${f.b.v}` : ""}`;
      out.push({ label, remove: () => { filters.delete(k); onChange(); } });
    }
    if (sort) out.push({ label: `Sort ${colDef(sort.key).t} ${sort.dir === 1 ? "↑" : "↓"}`, remove: () => { sort = null; onChange(); } });
    return out;
  }

  return {
    apply, headerButton, mobileButton, pop, chips,
    get active() { return filters.size > 0 || sort !== null; },
    get filtered() { return filters.size > 0; },
    get sorted() { return sort !== null; },
    clear() { filters.clear(); sort = null; },
    /** ตั้งตัวกรองจากที่อื่น (กดแท่งใน Dashboard) values = ข้อความที่แสดงในตาราง ว่าง = (Blanks) */
    setValues(key, values) { filters.set(key, new Set(values.map((v) => (v === "" ? BLANK : v)))); },
    close,
  };
}
