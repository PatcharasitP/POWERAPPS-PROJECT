// make_mda.mjs · สร้างหรืออัปเดตแอป model driven "Log Electric Desk" ใน solution LogElectricDesk บน env pvdesk (ยกมาจาก Pending VAT Desk)
// หน้าแรก = web resource le_/desk/web/index.html เต็มจอ หน้าเดียว ผูกบทบาท LE Admin/Manager/Member ตาราง le_logelectric อยู่ในแอปให้ Power BI และแอดมินเปิดดิบได้
// รัน: PVDESK_TOKEN=$(az account get-access-token --resource https://pvdesk.crm5.dynamics.com --query accessToken -o tsv) node Log_Electric/desk/tools/make_mda.mjs
// สูตรจากคลัง Proven: ไซต์แมปใช้ $webresource: , ผูกบทบาทได้ทาง Web API $ref เท่านั้น , publish ด้วย PublishAllXml , ช่อง url (ลิงก์สั้น) ไม่ติดไปกับไฟล์ solution
const BASE = "https://pvdesk.crm5.dynamics.com";
const API = `${BASE}/api/data/v9.2/`;
const SOLUTION = "LogElectricDesk";
const UNIQUE = "le_LogElectricDesk";
const SUFFIX = "logelectric";
const ROLES = ["LE Admin", "LE Manager", "LE Member"];
const TOKEN = process.env.PVDESK_TOKEN || "";
if (!TOKEN) { console.error("ไม่มี PVDESK_TOKEN"); process.exit(2); }

async function api(method, path, body, headers = {}) {
  const url = /^https:/.test(path) ? path : API + path;
  if (!url.startsWith(BASE + "/")) throw new Error("ด่านกัน: ไม่ใช่ env pvdesk " + url);
  const res = await fetch(url, { method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json", "OData-Version": "4.0", "Content-Type": "application/json", ...headers } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path.slice(0, 100)} ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const inSol = { "MSCRM.SolutionUniqueName": SOLUTION };
const t = (s) => `<Titles><Title LCID="1033" Title="${s}" /></Titles>`;
const SITEMAP = `<SiteMap IntroducedVersion="7.0.0.0"><Area Id="le_area" ShowGroups="true">${t("Log Electric")}<Group Id="le_grp">${t("Log Electric Desk")}`
  + `<SubArea Id="le_desk" Url="$webresource:le_/desk/web/index.html" AvailableOffline="false" PassParams="false" Icon="/_imgs/imagestrips/transparent_spacer.gif">${t("Log Electric Desk")}</SubArea>`
  + `</Group></Area></SiteMap>`;

const NAV = { showhome: false, showpinned: false, showrecents: false }; // เมนูซ้ายเหลือหน้า Log Electric Desk อย่างเดียว

// 1) ไซต์แมป
let sm = (await api("GET", `sitemaps?$select=sitemapid&$filter=sitemapnameunique eq '${UNIQUE}'`)).value[0];
if (sm) { await api("PATCH", `sitemaps(${sm.sitemapid})`, { sitemapxml: SITEMAP, ...NAV }); console.log("อัปเดตไซต์แมป", sm.sitemapid); }
else { sm = await api("POST", "sitemaps", { sitemapname: "Log Electric Desk", sitemapnameunique: UNIQUE, sitemapxml: SITEMAP, ...NAV }, { ...inSol, Prefer: "return=representation" }); console.log("สร้างไซต์แมป", sm.sitemapid); }

// 2) แอป (แอปที่เพิ่งสร้างยังไม่ publish อ่านด้วย GET ปกติได้ 404 ต้องหาใน RetrieveUnpublishedMultiple)
const findApp = async () => (await api("GET", `appmodules/Microsoft.Dynamics.CRM.RetrieveUnpublishedMultiple()?$select=appmoduleid,name,url,uniquename`)).value.find((a) => a.uniquename === UNIQUE);
let app = await findApp();
if (!app) {
  await api("POST", "appmodules", { name: "Log Electric Desk", uniquename: UNIQUE, url: SUFFIX, clienttype: 4, navigationtype: 0,
    description: "บันทึก LOG ELECTRIC ตามเทมเพลต นำเข้าไฟล์ ส่งออก Dashboard", webresourceid: "953b9fac-1e5e-e611-80d6-00155ded156f" }, inSol);
  app = await findApp();
  console.log("สร้างแอป", app.appmoduleid);
} else {
  if (app.url !== SUFFIX) await api("PATCH", `appmodules(${app.appmoduleid})`, { url: SUFFIX });
  console.log("มีแอปแล้ว", app.appmoduleid);
}
const appId = app.appmoduleid;

// 3) ส่วนประกอบ: ไซต์แมป + ตาราง le_logelectric
const ent = await api("GET", "EntityDefinitions(LogicalName='le_logelectric')?$select=MetadataId");
await api("POST", "AddAppComponents", { AppId: appId, Components: [
  { "@odata.type": "Microsoft.Dynamics.CRM.sitemap", sitemapid: sm.sitemapid },
  { "@odata.type": "Microsoft.Dynamics.CRM.entity", entityid: ent.MetadataId },
] });

// 4) บทบาท (ผูกที่ business unit ราก)
const have = new Set(((await api("GET", `appmodules(${appId})?$select=name&$expand=appmoduleroles_association($select=roleid)`).catch(() => null))?.appmoduleroles_association || []).map((r) => r.roleid));
for (const name of ROLES) {
  const r = (await api("GET", `roles?$select=roleid,_parentrootroleid_value&$filter=name eq '${name}'`)).value.find((x) => x.roleid === x._parentrootroleid_value);
  if (!r) throw new Error("ไม่พบบทบาท " + name);
  if (have.has(r.roleid)) continue;
  await api("POST", `appmodules(${appId})/appmoduleroles_association/$ref`, { "@odata.id": `${API}roles(${r.roleid})` });
  console.log("ผูกบทบาท", name);
}

// 5) ตรวจความถูกต้องของแอป แล้ว publish
const v = await api("GET", `ValidateApp(AppModuleId=${appId})`);
const issues = v.AppValidationResponse?.ValidationIssueList || [];
console.log("ValidateApp:", v.AppValidationResponse?.ValidationSuccess, issues.map((i) => `${i.ErrorType} ${i.Message}`).join(" | "));
await api("POST", "PublishAllXml");

// 6) อ่านกลับ
const back = await api("GET", `appmodules(${appId})?$select=name,uniquename,url,publishedon&$expand=appmoduleroles_association($select=name)`);
const comps = await api("GET", `appmodulecomponents?$select=componenttype,objectid&$filter=_appmoduleidunique_value eq ${(await api("GET", `appmodules(${appId})?$select=appmoduleidunique`)).appmoduleidunique}`).catch((e) => ({ value: [], err: e.message }));
console.log(JSON.stringify({ name: back.name, url: back.url, publishedon: back.publishedon, roles: back.appmoduleroles_association.map((r) => r.name), components: comps.value.map((c) => c.componenttype) }));
console.log(`เปิดแอป: ${BASE}/apps/${SUFFIX}?navbar=off&cmdbar=false`);
console.log(`หรือ: ${BASE}/main.aspx?appid=${appId}`);
