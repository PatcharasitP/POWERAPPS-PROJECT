// deploy_webres.mjs · แพ็กเว็บแอปเป็น web resource ชื่อ le_/desk/<ทางเดิม> ใส่ solution LogElectricDesk แล้ว publish แล้วตรวจ sha256 เทียบไฟล์ในเครื่อง (ยกมาจาก Pending VAT Desk)
// รัน (จากโฟลเดอร์ Claude Code) token ส่งผ่านตัวแปรตอนรันเท่านั้น:
//   PVDESK_TOKEN=$(az account get-access-token --resource https://pvdesk.crm5.dynamics.com --query accessToken -o tsv) node Log_Electric/desk/tools/deploy_webres.mjs [--dry | --check]
// ไม่รวม web/mock (ข้อมูลจริงของบริษัท ห้ามขึ้น env นอกทรู) , ไฟล์ที่เนื้อเหมือนเดิมข้าม , ด่านกันยิงได้เฉพาะ env pvdesk
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://pvdesk.crm5.dynamics.com";
const API = `${BASE}/api/data/v9.2/`;
const SOLUTION = "LogElectricDesk";
const PREFIX = "le_/desk/";
const TOKEN = process.env.PVDESK_TOKEN || "";
const DRY = process.argv.includes("--dry");
const CHECK = process.argv.includes("--check"); // ตรวจอย่างเดียว ไม่อัปโหลด
const ROOT = fileURLToPath(new URL("..", import.meta.url)); // Log_Electric/desk/
const TYPE = { ".html": 1, ".css": 2, ".js": 3, ".svg": 11, ".png": 5 };
const SKIP = [/^web\/mock\//, /\.test\./, /^web\/bak\//];

if (!TOKEN && !DRY) { console.error("ไม่มี PVDESK_TOKEN"); process.exit(2); }

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}
const files = ["web"].flatMap((d) => walk(join(ROOT, d)))
  .map((p) => relative(ROOT, p).split(sep).join("/"))
  .filter((r) => TYPE[extname(r)] && !SKIP.some((re) => re.test(r)))
  .sort();
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

async function api(method, path, body, headers = {}) {
  const url = /^https:/.test(path) ? path : API + path;
  if (!url.startsWith(BASE + "/")) throw new Error("ด่านกัน: ไม่ใช่ env pvdesk " + url);
  const res = await fetch(url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", "OData-Version": "4.0", "Content-Type": "application/json", ...headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.slice(0, 120)} ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const total = files.reduce((a, r) => a + statSync(join(ROOT, r)).size, 0);
console.log(`ไฟล์ ${files.length} ไฟล์ รวม ${(total / 1024).toFixed(0)} KB`);
if (DRY) { for (const r of files) console.log(" ", PREFIX + r); process.exit(0); }

const have = new Map();
let next = `webresourceset?$select=webresourceid,name,content&$filter=${encodeURIComponent(`startswith(name,'${PREFIX}')`)}`;
while (next) { const r = await api("GET", next); for (const w of r.value) have.set(w.name, w); next = r["@odata.nextLink"] || null; }

const changed = [];
let created = 0, updated = 0, same = 0;
for (const r of CHECK ? [] : files) {
  const buf = readFileSync(join(ROOT, r));
  const name = PREFIX + r;
  const content = buf.toString("base64");
  const cur = have.get(name);
  if (cur && cur.content === content) { same++; continue; }
  if (cur) {
    await api("PATCH", `webresourceset(${cur.webresourceid})`, { content });
    changed.push(cur.webresourceid); updated++;
  } else {
    const w = await api("POST", "webresourceset", { name, displayname: name, webresourcetype: TYPE[extname(r)], content },
      { "MSCRM.SolutionUniqueName": SOLUTION, Prefer: "return=representation" });
    changed.push(w.webresourceid); created++;
  }
  process.stdout.write(".");
}
console.log(`\nสร้าง ${created} แก้ ${updated} เหมือนเดิม ${same}`);
if (changed.length) {
  // PublishAllXml ไม่ใช่ PublishXml: แอป model driven แคช web resource ตามเลข stamp ของ org ซึ่งขยับเฉพาะ PublishAllXml (Proven 14/08/2026)
  await api("POST", "PublishAllXml");
  console.log(`publish ทั้ง org แล้ว (${changed.length} ไฟล์เปลี่ยน)`);
}

// ตรวจ: ของบน Dataverse (หลัง publish) sha256 ตรงไฟล์ในเครื่องทุกไฟล์ และอยู่ใน solution
const live = new Map();
next = `webresourceset?$select=webresourceid,name,content&$filter=${encodeURIComponent(`startswith(name,'${PREFIX}')`)}`;
while (next) { const r = await api("GET", next); for (const w of r.value) live.set(w.name, w); next = r["@odata.nextLink"] || null; }
const bad = files.filter((r) => { const w = live.get(PREFIX + r); return !w || sha(Buffer.from(w.content || "", "base64")) !== sha(readFileSync(join(ROOT, r))); });
const sol = await api("GET", `solutions?$select=solutionid&$filter=uniquename eq '${SOLUTION}'`);
const comps = await api("GET", `solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${sol.value[0].solutionid} and componenttype eq 61`);
const inSol = new Set(comps.value.map((c) => c.objectid));
const notIn = files.filter((r) => live.get(PREFIX + r) && !inSol.has(live.get(PREFIX + r).webresourceid));
const extra = [...live.keys()].filter((n) => !files.includes(n.slice(PREFIX.length)));
// ชั้น 2: ของที่ /webresources/ เสิร์ฟจริง (ไม่ใช่แค่ record)
const served = [];
for (const r of files) {
  const res = await fetch(`${BASE}/webresources/${PREFIX}${r}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || sha(buf) !== sha(readFileSync(join(ROOT, r)))) served.push(`${r} ${res.status} ${res.headers.get("content-type")}`);
}
console.log(`ชั้นเสิร์ฟจริง /webresources/ ตรง ${files.length - served.length}/${files.length}`);
for (const x of served) console.log("  เสิร์ฟไม่ตรง", x);
console.log(`ตรวจ sha256 ตรง ${files.length - bad.length}/${files.length} , อยู่ใน solution ${files.length - notIn.length}/${files.length} , บน Dataverse เกินจากในเครื่อง ${extra.length}`);
for (const r of bad) console.log("  sha ไม่ตรง", r);
for (const r of notIn) console.log("  ไม่อยู่ใน solution", r);
for (const n of extra) console.log("  เกิน", n);
console.log(`เปิดได้ที่ ${BASE}/WebResources/${PREFIX}web/index.html`);
process.exit(bad.length || notIn.length || served.length ? 1 : 0);
