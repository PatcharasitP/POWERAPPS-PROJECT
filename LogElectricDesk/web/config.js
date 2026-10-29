// config.js · สเปกช่องทั้งหมดของ LOG ELECTRIC ที่เดียว (ตาราง, ฟอร์ม, เทมเพลต, ตัวตรวจไฟล์, ส่งออก อ่านจากที่นี่)
// ที่มา: ชีต WEBAPP-LOG ELECTRIC ในไฟล์ WEBAPP-LOG ELECTRIC.xlsx ของพี่ปอนด์ (29/10/2026)
//   แถว 1 ประเภทช่อง (REQUIRED, ว่างได้, AUTO แก้ไม่ได้) แถว 2 หัวคอลัมน์ แถว 3 ชนิด แถว 4 ขึ้นไป ตัวเลือก dropdown

export const TABLE = "le_logelectric";
export const SET = "le_logelectrics";
export const ID = "le_logelectricid";
export const HISTORY_SET = "le_histories";

export const COMPANIES = Object.freeze({
  "1019": "TRUE INTERNET CORPORATION COMPANY LIMITED",
  "1068": "TRUE MOVE H UNIVERSAL COMMUNICATION CO., LTD.",
  "1069": "BFKT (THAILAND) LIMITED",
});

// kind: date, text, num, choice | input: required, optional, auto (ระบบเติม ไม่อยู่ในเทมเพลต แก้ไม่ได้)
// col = ชื่อคอลัมน์ Dataverse , max = ความยาวสูงสุดตามตาราง
export const FIELDS = Object.freeze([
  { key: "index", col: "le_index", t: "INDEX", kind: "int", input: "auto" },
  { key: "logBookDate", col: "le_logbookdate", t: "LOG BOOK DATE", kind: "date", input: "required" },
  { key: "proNumber", col: "le_pronumber", t: "PRO NUMBER", kind: "text", input: "required", max: 100 },
  { key: "siteCode", col: "le_sitecode", t: "SITE CODE CANDIDATE", kind: "text", input: "required", max: 100 },
  { key: "siteCodeNoCand", col: "le_sitecodenocand", t: "SITE CODE NO CANDIDATE", kind: "text", input: "auto", max: 100 },
  { key: "name", col: "le_name", t: "NAME", kind: "text", input: "required", max: 200 },
  { key: "dueDate", col: "le_duedate", t: "DUE DATE", kind: "date", input: "required" },
  { key: "amount", col: "le_amount", t: "AMOUNT", kind: "num", input: "required" },
  { key: "paymentMethod", col: "le_paymentmethod", t: "PAYMENT METHOD", kind: "choice", input: "required", options: ["CHEQUE", "BANK TRANSFER"] },
  { key: "accountant", col: "le_accountant", t: "ACCOUNTANT", kind: "text", input: "required", max: 100 },
  { key: "requestor", col: "le_requestor", t: "REQUESTOR", kind: "text", input: "required", max: 100 },
  { key: "team", col: "le_team", t: "TEAM", kind: "choice", input: "required", options: ["IBC", "MACRO", "ONLINE"] },
  { key: "system", col: "le_system", t: "SYSTEM", kind: "choice", input: "required", options: ["SITE RENTAL", "DASHBOARD"] },
  { key: "companyCode", col: "le_companycode", t: "COMPANY CODE", kind: "choice", input: "optional", options: Object.keys(COMPANIES) },
  { key: "companyName", col: "le_companyname", t: "COMPANY NAME", kind: "text", input: "auto", max: 200 },
  { key: "remark", col: "le_remark", t: "REMARK", kind: "text", input: "optional", max: 1000 },
]);

// คอลัมน์ของระบบ (Dataverse เติมเอง) แสดงในตารางและส่งออกได้ ไม่อยู่ในเทมเพลต
export const SYSTEM_COLS = Object.freeze([
  { key: "createdOn", t: "CREATED ON", kind: "datetime", input: "auto" },
  { key: "createdBy", t: "CREATED BY", kind: "text", input: "auto" },
  { key: "modifiedOn", t: "UPDATED ON", kind: "datetime", input: "auto" },
  { key: "modifiedBy", t: "UPDATED BY", kind: "text", input: "auto" },
  { key: "edits", t: "HISTORY", kind: "int", input: "auto" },
  { key: "source", t: "SOURCE", kind: "text", input: "auto" },
]);

export const ALL_COLS = Object.freeze([...FIELDS, ...SYSTEM_COLS]);
export const BY_KEY = new Map(ALL_COLS.map((c) => [c.key, c]));
export const colDef = (k) => BY_KEY.get(k);
/** ช่องที่อยู่ในเทมเพลตและฟอร์ม (ตัด AUTO ออก) ตามลำดับเทมเพลต */
export const INPUT_FIELDS = FIELDS.filter((f) => f.input !== "auto");
export const TEMPLATE_SHEET = "LOG ELECTRIC";
/** ตัวอย่างในเทมเพลต (ชีต How to fill และแถว 2 ของชีต LOG ELECTRIC) ตามที่พี่ปอนด์ส่งมา 29/10 รอบ 4
 *  แถวที่ค่าตรงตัวอย่างทุกช่องถือเป็นแถวตัวอย่าง ตอนนำเข้าข้ามให้เอง */
export const TEMPLATE_EXAMPLE = Object.freeze({ logBookDate: "29/10/2026", proNumber: "PRO Group", siteCode: "BKK4874A", name: "ABC Property Co., Ltd.",
  dueDate: "13/11/2026", amount: "2021.54", paymentMethod: "BANK TRANSFER", accountant: "Patcharasit Pongudom", requestor: "Jirachaya Rachpolsaen",
  team: "IBC", system: "SITE RENTAL", companyCode: "1068", remark: "Meter 5.13 kW" });
