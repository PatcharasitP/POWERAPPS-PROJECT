// dv.js · ชั้นข้อมูล: ยิง Dataverse Web API ตรงจากหน้าเว็บ (web resource อยู่ origin เดียวกับ org ใช้คุกกี้ของผู้ใช้ ไม่ต้องมี token)
// สิทธิ์ทั้งหมดบังคับที่ Dataverse (บทบาท LE Member เห็นแถวตัวเอง) หน้าเว็บแค่ซ่อนปุ่มที่ใช้ไม่ได้
import { FIELDS, SET, ID, HISTORY_SET } from "./config.js";

const API = "/api/data/v9.2/";
const BATCH_MAX = 100;
const FV = "@OData.Community.Display.V1.FormattedValue";
const HDR = { Accept: "application/json", "OData-MaxVersion": "4.0", "OData-Version": "4.0" };
const SELECT = [ID, ...FIELDS.map((f) => f.col), "le_source", "createdon", "modifiedon", "_createdby_value", "_modifiedby_value", "_ownerid_value"].join(",");

export class DvError extends Error {
  constructor(status, msg, code) { super(msg); this.status = status; this.code = code; }
}

async function call(method, path, { body, headers = {}, raw = false } = {}) {
  for (let i = 0; ; i++) {
    let res;
    try {
      res = await fetch(path.startsWith("http") || path.startsWith("/") ? path : API + path, {
        method, credentials: "same-origin", body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
        headers: { ...HDR, ...(body !== undefined && typeof body !== "string" ? { "Content-Type": "application/json; charset=utf-8" } : {}), ...headers },
      });
    } catch { // เน็ตหลุด เบราว์เซอร์ขึ้นแค่ Failed to fetch (ไล่บัครอบ 3)
      throw new DvError(0, "Cannot reach the server. Check your connection and try again.");
    }
    if ((res.status === 429 || res.status === 503) && i < 4) { // Dataverse ให้รอตาม Retry-After
      await new Promise((r) => setTimeout(r, Math.min(30, Number(res.headers.get("Retry-After")) || 5) * 1000));
      continue;
    }
    const text = await res.text();
    // $batch ที่ล้มทั้งก้อนยังส่งผลแยกรายคำสั่งกลับมา ให้ batch() อ่านสถานะข้างในเอง (แถวถูกลบไปแล้วเคยขึ้นข้อความดิบ ไล่บัครอบ 3)
    if (!res.ok && !(raw && /multipart/i.test(res.headers.get("Content-Type") || ""))) {
      let msg = text, code = "";
      try { const j = JSON.parse(text); msg = j.error?.message || text; code = j.error?.code || ""; } catch { /* ข้อความดิบ */ }
      throw new DvError(res.status, friendly(res.status, msg), code);
    }
    if (raw) return { text, headers: res.headers };
    return text ? JSON.parse(text) : null;
  }
}

function friendly(status, msg) {
  if (status === 403 || /privilege|prv[A-Z]/i.test(msg)) return "You don't have permission to do this.";
  if (status === 412) return "Someone else changed this row. Refresh and try again.";
  if (status === 401) return "Your session has expired. Refresh the page and sign in again."; // (ไล่บัครอบ 3)
  if (status === 404 || /Does Not Exist|retrieval of version numbers failed/i.test(msg)) return "This row no longer exists. Someone may have deleted it. Click Refresh to see the latest rows.";
  return msg.slice(0, 300);
}

/** แถวจาก Dataverse -> แถวของแอป (คีย์ตาม config) */
export function fromDv(o) {
  const r = { id: o[ID], etag: o["@odata.etag"], ownerId: o._ownerid_value, ownerType: o["_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname"] || "systemuser" };
  for (const f of FIELDS) {
    const v = o[f.col];
    if (f.kind === "date") r[f.key] = v ? String(v).slice(0, 10) : "";
    else if (f.kind === "num") r[f.key] = v === null || v === undefined ? null : Number(v);
    else if (f.key === "index") r[f.key] = v ? Number(v) : null;
    else r[f.key] = v ?? "";
  }
  r.source = o.le_source || "";
  r.ownerName = o["_ownerid_value" + FV] || ""; // ช่องเลือกชื่อคนของ Admin กับ Manager
  r.createdOn = o.createdon || "";
  r.modifiedOn = o.modifiedon || "";
  r.createdBy = o[`_createdby_value${FV}`] || "";
  r.modifiedBy = o[`_modifiedby_value${FV}`] || "";
  return r;
}

/** ค่าของแอป -> ตัวเขียน Dataverse (เฉพาะช่องที่ส่งมา ช่อง INDEX ระบบออกเอง) */
export function toDv(values) {
  const out = {};
  for (const f of FIELDS) {
    if (f.key === "index" || !(f.key in values)) continue;
    const v = values[f.key];
    out[f.col] = v === "" || v === undefined ? null : v;
  }
  return out;
}

export async function whoAmI() {
  const w = await call("GET", "WhoAmI");
  const u = await call("GET", `systemusers(${w.UserId})?$select=fullname`);
  return { id: w.UserId, name: u.fullname };
}

/** บทบาทของผู้ใช้ (ทั้งที่ผูกตรงและผ่านทีม) -> ADMIN, MANAGER, MEMBER */
export async function myRole(userId) {
  const names = new Set();
  const direct = await call("GET", `systemusers(${userId})/systemuserroles_association?$select=name`);
  direct.value.forEach((r) => names.add(r.name));
  try {
    const teams = await call("GET", `systemusers(${userId})/teammembership_association?$select=teamid&$expand=teamroles_association($select=name)`);
    teams.value.forEach((t) => (t.teamroles_association || []).forEach((r) => names.add(r.name)));
  } catch { /* อ่านทีมไม่ได้ ใช้บทบาทตรง */ }
  if (names.has("LE Admin") || names.has("System Administrator")) return "ADMIN";
  if (names.has("LE Manager")) return "MANAGER";
  if (names.has("LE Member")) return "MEMBER";
  return "NONE"; // ไม่มีบทบาท LE เลย บอกตั้งแต่เปิดแอป ไม่ปล่อยไปล้มตอนโหลด (ไล่บัครอบ 3)
}

/** ทุกแถวที่ผู้ใช้มีสิทธิ์เห็น (Member ได้แถวของตัวเอง Dataverse กรองให้) */
export async function loadAll(onProgress) {
  const rows = [];
  let next = `${SET}?$select=${SELECT}&$orderby=createdon desc`;
  while (next) {
    const j = await call("GET", next, { headers: { Prefer: `odata.maxpagesize=5000,odata.include-annotations="*"` } });
    for (const o of j.value) rows.push(fromDv(o));
    next = j["@odata.nextLink"] || null;
    onProgress?.(rows.length);
  }
  // แถวจากไฟล์เดียวกันมีเวลาสร้างตรงกันถึงวินาที Dataverse ส่งลำดับมามั่ว (เห็นจริง 3..40 แล้ว 1 2) เรียงด้วย INDEX ซ้ำ ใหม่สุดอยู่บน
  const n = (r) => Number(r.index) || 0;
  return rows.sort((a, b) => n(b) - n(a));
}

/** จำนวนครั้งที่แก้ต่อแถว Map(id -> n) */
export async function historyCounts() {
  const out = new Map();
  try {
    // $apply groupby กับคอลัมน์ lookup ได้ 400 (0x80041103 ยิงจริง 29/10) ใช้ FetchXML aggregate แทน
    const fx = `<fetch aggregate="true"><entity name="le_history"><attribute name="le_historyid" alias="n" aggregate="count"/><attribute name="le_record" alias="rec" groupby="true"/></entity></fetch>`;
    const j = await call("GET", `${HISTORY_SET}?fetchXml=${encodeURIComponent(fx)}`);
    for (const g of j.value) if (g.rec) out.set(g.rec, Number(g.n));
  } catch { /* ไม่มีประวัติหรือเกินเพดาน aggregate แสดงเป็นว่าง */ }
  return out;
}

export async function historyOf(id) {
  const j = await call("GET", `${HISTORY_SET}?$select=le_name,le_changes,le_action,createdon,_createdby_value&$filter=_le_record_value eq ${id}&$orderby=createdon desc`,
    { headers: { Prefer: `odata.include-annotations="*"` } });
  return j.value.map((o) => ({ at: o.createdon, by: o[`_createdby_value${FV}`] || "", action: o.le_action, summary: o.le_name, changes: safeJson(o.le_changes) }));
}
const safeJson = (s) => { try { return JSON.parse(s || "[]"); } catch { return []; } };

export async function getOne(id) {
  return fromDv(await call("GET", `${SET}(${id})?$select=${SELECT}`, { headers: { Prefer: `odata.include-annotations="*"` } }));
}

export async function createOne(values, source = "Manual") {
  const res = await call("POST", SET, { body: { ...toDv(values), le_source: source }, headers: { Prefer: `return=representation,odata.include-annotations="*"` } });
  return fromDv(res);
}

// ---------- $batch ----------
function batchBody(boundary, parts, changeset) {
  const cs = "changeset_" + Math.random().toString(36).slice(2);
  const lines = [];
  const req = (p, i) => [`Content-Type: application/http`, `Content-Transfer-Encoding: binary`, ...(changeset ? [`Content-ID: ${i + 1}`] : []), "",
    `${p.method} ${API}${p.url} HTTP/1.1`, `Content-Type: application/json; charset=utf-8`, ...Object.entries(p.headers || {}).map(([k, v]) => `${k}: ${v}`), "",
    p.body === undefined ? "" : JSON.stringify(p.body)];
  if (changeset) {
    lines.push(`--${boundary}`, `Content-Type: multipart/mixed; boundary=${cs}`, "");
    parts.forEach((p, i) => lines.push(`--${cs}`, ...req(p, i)));
    lines.push(`--${cs}--`);
  } else {
    parts.forEach((p, i) => lines.push(`--${boundary}`, ...req(p, i)));
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

/** ส่งหลายคำสั่งในก้อนเดียว changeset = สำเร็จหรือล้มทั้งก้อน คืนสถานะแต่ละคำสั่ง */
export async function batch(parts, changeset = true) {
  const boundary = "batch_" + Math.random().toString(36).slice(2);
  const { text } = await call("POST", "$batch", { body: batchBody(boundary, parts, changeset), headers: { "Content-Type": `multipart/mixed; boundary=${boundary}` }, raw: true });
  const statuses = [...text.matchAll(/HTTP\/1\.1 (\d{3})/g)].map((m) => Number(m[1]));
  const bad = statuses.findIndex((s) => s >= 400);
  if (bad >= 0) {
    const m = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
    throw new DvError(statuses[bad], friendly(statuses[bad], m ? JSON.parse(`"${m[1]}"`) : "Save failed"));
  }
  return statuses;
}

/** แก้หนึ่งแถว พร้อมเขียนประวัติในก้อนเดียวกัน (สำเร็จหรือล้มพร้อมกัน) changes = [{t, from, to}] */
export async function updateOne(row, values, changes) {
  if (!changes.length) return row;
  const owner = `/${row.ownerType === "team" ? "teams" : "systemusers"}(${row.ownerId})`;
  const summary = changes.map((c) => c.t).join(", ").slice(0, 200);
  await batch([
    { method: "PATCH", url: `${SET}(${row.id})`, body: toDv(values), headers: { "If-Match": row.etag } },
    { method: "POST", url: HISTORY_SET, body: { le_name: summary, le_action: 2, le_recordindex: String(row.index ?? ""),
      le_changes: JSON.stringify(changes), "le_record@odata.bind": `/${SET}(${row.id})`, "ownerid@odata.bind": owner } },
  ]);
  return getOne(row.id);
}

/** สร้างหลายแถว ก้อนละ 100 (แต่ละก้อนสำเร็จหรือล้มทั้งก้อน) คืนจำนวนที่เขียนแล้ว ล้มกลางทางโยน error พร้อมจำนวนที่เขียนไปแล้ว */
export async function createMany(list, source, onProgress) {
  let done = 0;
  for (let i = 0; i < list.length; i += BATCH_MAX) {
    const chunk = list.slice(i, i + BATCH_MAX);
    try {
      await batch(chunk.map((v) => ({ method: "POST", url: SET, body: { ...toDv(v), le_source: source } })));
    } catch (e) {
      e.done = done;
      throw e;
    }
    done += chunk.length;
    onProgress?.(done, list.length);
  }
  return done;
}

/** ลบทุกแถวที่มองเห็น (ADMIN) ทีละ 100 จนหมด ประวัติถูกลบตามด้วย cascade */
export async function deleteAll(onProgress) {
  let deleted = 0;
  for (;;) {
    const j = await call("GET", `${SET}?$select=${ID}`, { headers: { Prefer: "odata.maxpagesize=1000" } });
    if (!j.value.length) break;
    for (let i = 0; i < j.value.length; i += BATCH_MAX) {
      const ids = j.value.slice(i, i + BATCH_MAX).map((o) => o[ID]);
      await batch(ids.map((id) => ({ method: "DELETE", url: `${SET}(${id})` })), false);
      deleted += ids.length;
      onProgress?.(deleted);
    }
  }
  return deleted;
}

export async function deleteOne(id) {
  await call("DELETE", `${SET}(${id})`);
}

// ---------- เลข INDEX (autonumber) ----------
// Dataverse เริ่ม SEQNUM ที่ 1000 และไม่ย้ายค่าเริ่มไปกับ solution ติดตั้งที่ทรูแล้ว Admin กดตั้งให้ต่อจากเลขสูงสุด (ว่างทั้งตาราง = 1)
export async function setIndexSeed(value) {
  await call("POST", "SetAutoNumberSeed", { body: { EntityName: "le_logelectric", AttributeName: "le_index", Value: value } });
}
