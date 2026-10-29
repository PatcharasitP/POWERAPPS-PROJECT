// core/xlsxstyle.js · ลงสีไฟล์ error หลัง SheetJS เขียนเสร็จ (รุ่นฟรีไม่เขียนสีให้) แก้ styles.xml กับ sheet1.xml ในซิปตรง ๆ ด้วย XLSX.CFB ที่มากับไลบรารี
//   หัวคอลัมน์สีเดียวกับเทมเพลต (ช่องบังคับชมพูตัวแดงเข้ม ช่องไม่บังคับเทา) , หัว ERROR แดงตัวขาว , ช่อง ERROR ชมพูอ่อนตัวแดงหนา (พี่ปอนด์ 29/10 รอบ 4) , ช่องที่ผิดในแถวนั้นสีเดียวกับหัวคอลัมน์ พื้นชมพูอ่อน ตัวแดงเข้ม (พี่ปอนด์ 29/10)
// ไม่มี DOM รับ XLSX เข้ามา ทดสอบใน node ได้

const BORDER = '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>';
const font = (rgb, bold) => `<font>${bold ? "<b/>" : ""}<sz val="11"/><color rgb="${rgb}"/><name val="Calibri"/><family val="2"/></font>`;
const fill = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;

/** เพิ่มของลงในกลุ่ม <tag count="n">...</tag> คืน id ของชิ้นแรกที่เพิ่ม */
function addTo(xml, tag, items) {
  const re = new RegExp(`<${tag} count="(\\d+)"([^>]*)>([\\s\\S]*?)</${tag}>`);
  const m = xml.match(re);
  const n = Number(m[1]);
  return { xml: xml.replace(re, `<${tag} count="${n + items.length}"${m[2]}>${m[3]}${items.join("")}</${tag}>`), first: n };
}

function partIndex(cfb, path) {
  const i = cfb.FullPaths.findIndex((p) => p.replace(/^Root Entry\//, "") === path);
  if (i < 0) throw new Error(`ไม่พบ ${path} ในไฟล์`);
  return i;
}

/**
 * @param XLSX ไลบรารี SheetJS
 * @param u8 ไฟล์ xlsx ที่เขียนแล้ว (ชีตเดียว)
 * @param opt { headerRow: แถวหัว (นับจาก 1), errCol: คอลัมน์ ERROR (นับจาก 0), cells: Map(แถว -> Set(คอลัมน์ที่ผิด นับจาก 0)),
 *              heads: Map(คอลัมน์ -> "required" | "optional") }
 */
export function styleErrorBook(XLSX, u8, { headerRow, errCol, cells, heads = new Map() }) {
  const cfb = XLSX.CFB.read(u8, { type: "array" });
  const iSt = partIndex(cfb, "xl/styles.xml"), iSh = partIndex(cfb, "xl/worksheets/sheet1.xml");
  const dec = (i) => new TextDecoder().decode(cfb.FileIndex[i].content);
  let st = dec(iSt);

  const xfsOld = [...st.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
  let r = addTo(st, "fonts", [font("FFFFFFFF", true), font("FFC00000", true), font("FFA80000", false), font("FFA80000", true), font("FF5F5B57", true)]); st = r.xml; const fo = r.first;
  r = addTo(st, "fills", [fill("FFC00000"), fill("FFFFF0F0"), fill("FFFDECEC"), fill("FFFDECEC"), fill("FFF2F2F2")]); st = r.xml; const fi = r.first;
  r = addTo(st, "borders", [BORDER]); st = r.xml; const bo = r.first;
  const xfs = [
    `<xf numFmtId="0" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="${fo + 1}" fillId="${fi + 1}" borderId="${bo}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="${fo + 3}" fillId="${fi + 3}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
    `<xf numFmtId="0" fontId="${fo + 4}" fillId="${fi + 4}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>`,
  ];
  const head = xfsOld.length, errText = xfsOld.length + 1, headReq = xfsOld.length + 2, headOpt = xfsOld.length + 3;
  // ช่องที่ผิด เก็บรูปแบบตัวเลขเดิมไว้ (วันที่ยังเป็นวันที่) หนึ่งแบบต่อรูปแบบ
  const badBy = new Map();
  const badXf = (oldS) => {
    const fmt = oldS == null ? "0" : (xfsOld[oldS] || "").match(/numFmtId="(\d+)"/)?.[1] || "0";
    if (!badBy.has(fmt)) { badBy.set(fmt, xfsOld.length + xfs.length); xfs.push(`<xf numFmtId="${fmt}" fontId="${fo + 2}" fillId="${fi + 2}" borderId="${bo}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>`); }
    return badBy.get(fmt);
  };

  const sh = dec(iSh).replace(/<row r="(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (all, rn, attrs, inner) => {
    const row = Number(rn);
    const bad = cells.get(row);
    const isErrRow = row === headerRow || bad;
    if (!isErrRow) return all;
    const list = [...(inner || "").matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
      .map((m) => ({ col: XLSX.utils.decode_col(m[1]), attrs: m[2], body: m[3] }));
    const want = new Map();
    if (row === headerRow) {
      for (const [c, kind] of heads) if (c !== errCol) want.set(c, () => (kind === "required" ? headReq : headOpt));
      want.set(errCol, () => head);
    }
    else {
      want.set(errCol, () => errText);
      for (const c of bad) if (c !== errCol) want.set(c, (oldS) => badXf(oldS));
    }
    for (const [c] of want) if (!list.some((x) => x.col === c)) list.push({ col: c, attrs: "", body: undefined });
    list.sort((a, b) => a.col - b.col);
    const cellsXml = list.map(({ col, attrs, body }) => {
      if (want.has(col)) {
        const old = attrs.match(/\ss="(\d+)"/);
        attrs = attrs.replace(/\ss="\d+"/, "") + ` s="${want.get(col)(old ? Number(old[1]) : null)}"`;
      }
      const ref = XLSX.utils.encode_col(col) + row;
      return body === undefined ? `<c r="${ref}"${attrs}/>` : `<c r="${ref}"${attrs}>${body}</c>`;
    }).join("");
    return `<row r="${rn}"${attrs}>${cellsXml}</row>`;
  });

  st = st.replace(/<cellXfs count="\d+"([^>]*)>([\s\S]*?)<\/cellXfs>/, (_, a, body) => `<cellXfs count="${xfsOld.length + xfs.length}"${a}>${body}${xfs.join("")}</cellXfs>`);
  const enc = new TextEncoder();
  cfb.FileIndex[iSt].content = enc.encode(st);
  cfb.FileIndex[iSh].content = enc.encode(sh);
  return new Uint8Array(XLSX.CFB.write(cfb, { fileType: "zip", type: "array", compression: true }));
}
