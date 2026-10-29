// sitecode.js · ดึง Site Code จากข้อความอิสระ (port จาก Data/ADVANCE/fnExtractSite.pq v5.1)
//
// ไวยากรณ์ 1 หน่วย: อักษร 2-4 + ตัวเลข 3-6 + อักษรท้าย 0-3 (อักษร+เลขรวมต้อง >= 7)
// v5: เลขแทรกกลาง 1 ช่วง อักษร 2-4 + เลข 1-2 + อักษร 1-2 + เลข 3-6 (ใช้เมื่อ parse ปกติไม่ผ่าน)
// mode: null/true = รายการโค้ดตัด suffix, false = รายการโค้ดเต็ม, "both" = {full, noCandidate}
//
// ข้อสังเกตการ port: Text.Upper ของ M ทำงานตามวัฒนธรรม ที่นี่ใช้เฉพาะ a-z เป็น A-Z
// เพราะตัวอักษรอื่นถูกเปลี่ยนเป็นช่องว่างอยู่แล้วในขั้น cleaned

const isLetter = (c) => c >= "A" && c <= "Z";
const isDigit = (c) => c >= "0" && c <= "9";
const KEEP = /[^A-Z0-9\-/]/g;

// นับอักขระจากตำแหน่ง i ที่ผ่าน pred ติดกัน ไม่เกิน max
function runLen(s, i, max, pred) {
  const N = s.length;
  let c = 0;
  while (c < max && i + c < N && pred(s[i + c])) c++;
  return c;
}

// tile 1 run เป็นลิสต์ code รูปเต็ม (ยังไม่ตัด)
function tileRun(run) {
  const N = run.length;
  const out = [];
  let i = 0;
  while (i < N) {
    if (!isLetter(run[i])) {
      i += 1;
      continue;
    }
    const lead = runLen(run, i, 4, isLetter);
    const d0 = i + lead;
    const digs = runLen(run, d0, 6, isDigit);
    const t0a = d0 + digs;
    const okA = lead >= 2 && digs >= 3 && lead + digs >= 7;
    const md = runLen(run, d0, 2, isDigit);
    const m0 = d0 + md;
    const ml = runLen(run, m0, 2, isLetter);
    const d1 = m0 + ml;
    const digs2 = runLen(run, d1, 6, isDigit);
    const okM = !okA && lead >= 2 && md >= 1 && ml >= 1 && digs2 >= 3 && lead + md + ml + digs2 >= 7;
    const t0 = okM ? d1 + digs2 : t0a;
    const ok0 = okA || okM;
    if (!ok0) {
      i += 1;
      continue;
    }
    const ftl0 = runLen(run, t0, 4, isLetter);
    // อักษรท้ายตามด้วย "-" และลงท้าย "RM" คือ prefix RM- ของ code ถัดไป ไม่นับเป็น suffix
    const ftl =
      t0 + ftl0 < N && run[t0 + ftl0] === "-" && ftl0 >= 2 && run.slice(t0 + ftl0 - 2, t0 + ftl0) === "RM"
        ? ftl0 - 2
        : ftl0;
    const nxt = t0 + ftl;
    // อักษรท้ายที่ตามด้วยตัวเลข = ขึ้น code ใหม่ ไม่นับเป็น suffix
    const tail = nxt < N && isDigit(run[nxt]) ? 0 : ftl > 3 ? 3 : ftl;
    const endP = t0 + tail;
    out.push(run.slice(i, endP));
    i = endP;
  }
  return out;
}

// v5.1: ตัดอักษรท้ายเกลี้ยง 1-3 ตัว เว้นตระกูล RM- และ base ต้องเหลือ >= 5 ตัว
function canon(u) {
  const N = u.length;
  const isRM = u.startsWith("RM-");
  let k = 0;
  while (k < N && isLetter(u[N - 1 - k])) k++;
  const doStrip = !isRM && k >= 1 && k <= 3 && N - k >= 5;
  return doStrip ? u.slice(0, N - k) : u;
}

const distinct = (a) => [...new Set(a)];

/**
 * extractSite(text, mode)
 *   mode null/undefined/true -> string[] (ตัด suffix)
 *   mode false               -> string[] (รูปเต็ม)
 *   mode "both"              -> { full: string[], noCandidate: string[] }
 */
export function extractSite(text, mode) {
  const modeVal = mode === null || mode === undefined ? true : mode;
  const both = modeVal === "both";
  const s0 = text === null || text === undefined ? "" : String(text).trim().replace(/[a-z]/g, (c) => c.toUpperCase());
  const cleaned = s0.replace(KEEP, " ");
  const runs = cleaned.split(" ").filter((r) => r.length >= 6);
  const raw = runs.flatMap(tileRun);
  const fullList = distinct(raw);
  const ncList = distinct(raw.map(canon));
  if (both) return { full: fullList, noCandidate: ncList };
  if (modeVal === false) return fullList;
  return ncList;
}
