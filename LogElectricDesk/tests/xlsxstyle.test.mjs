// ไฟล์ error ลงสี: หัว ERROR แดงตัวขาว ช่อง ERROR ชมพูอ่อนตัวแดงหนา ช่องที่ผิดแดงอ่อน (รวมช่องว่างที่ไม่มีเซลล์ในไฟล์) วันที่ยังเป็นวันที่
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { styleErrorBook } from "../web/core/xlsxstyle.js";

const ctx = {}; vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../web/vendor/xlsx.full.min.js", import.meta.url), "utf8"), ctx);
const XLSX = ctx.XLSX;
const part = (u8, p) => { const c = XLSX.CFB.read(u8, { type: "array" }); return new TextDecoder().decode(c.FileIndex[c.FullPaths.indexOf("Root Entry/" + p)].content); };

test("ลงสีไฟล์ error", () => {
  const ws = XLSX.utils.aoa_to_sheet([["DATE", "AMOUNT", "TEAM", "ERROR"], [46324, 10, "IBC", null], [46324, "abc", null, "Row 3: AMOUNT | TEAM"]]);
  ws.A2.z = ws.A3.z = "dd/mm/yyyy";
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S");
  const u8 = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
  const out = styleErrorBook(XLSX, u8, { headerRow: 1, errCol: 3, cells: new Map([[3, new Set([1, 2])]]), heads: new Map([[0, "required"], [1, "required"], [2, "optional"]]) });
  const st = part(out, "xl/styles.xml"), sh = part(out, "xl/worksheets/sheet1.xml");
  const xfs = [...st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  const fills = [...st.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)[1].matchAll(/<fill>[\s\S]*?<\/fill>/g)].map((m) => m[0]);
  const fonts = [...st.match(/<fonts[^>]*>([\s\S]*?)<\/fonts>/)[1].matchAll(/<font>[\s\S]*?<\/font>/g)].map((m) => m[0]);
  assert.match(st, new RegExp(`<cellXfs count="${xfs.length}"`));
  assert.match(st, new RegExp(`<fills count="${fills.length}"`));
  const sOf = (ref) => Number((sh.match(new RegExp(`<c r="${ref}"[^>]*?s="(\\d+)"`)) || [])[1]);
  const look = (ref) => { const x = xfs[sOf(ref)]; return { fill: fills[+x.match(/fillId="(\d+)"/)[1]], font: fonts[+x.match(/fontId="(\d+)"/)[1]], fmt: x.match(/numFmtId="(\d+)"/)[1] }; };
  assert.match(look("D1").fill, /FFC00000/); assert.match(look("D1").font, /<b\/>[\s\S]*FFFFFFFF/);
  assert.match(look("D3").fill, /FFFFF0F0/); assert.match(look("D3").font, /<b\/>[\s\S]*FFC00000/);
  assert.match(look("A1").fill, /FFFDECEC/); assert.match(look("A1").font, /<b\/>[\s\S]*FFA80000/, "หัวช่องบังคับสีเดียวกับเทมเพลต");
  assert.match(look("C1").fill, /FFF2F2F2/); assert.match(look("C1").font, /<b\/>[\s\S]*FF5F5B57/, "หัวช่องไม่บังคับสีเทาแบบเทมเพลต");
  assert.match(look("B3").fill, /FFFDECEC/);
  assert.match(look("C3").fill, /FFFDECEC/, "ช่องว่างที่ผิดต้องมีเซลล์ลงสีด้วย");
  assert.ok(/<c r="A3"/.test(sh) && sh.indexOf('<c r="A3"') < sh.indexOf('<c r="B3"') && sh.indexOf('<c r="C3"') < sh.indexOf('<c r="D3"'), "เซลล์เรียงตามคอลัมน์");
  assert.equal(look("A2").fmt, look("A3").fmt); assert.notEqual(look("A3").fmt, "0", "วันที่ยังเป็นวันที่");
  assert.ok(Number.isNaN(sOf("B2")) || look("B2").fill === fills[0], "แถวที่ถูกไม่ลงสี");
  const back = XLSX.read(out, { type: "array" });
  assert.equal(back.Sheets.S.D3.v, "Row 3: AMOUNT | TEAM");
});
