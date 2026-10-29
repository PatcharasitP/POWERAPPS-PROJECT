#!/usr/bin/env python3
"""le_ui.py  เปิดหน้าจอจริงของ Log Electric Desk กับ Dataverse จริง env pvdesk (ข้อมูลสมมติจาก make_files.py)

หน้าเว็บเสิร์ฟจากเครื่อง ทุกคำขอ /api/data/v9.2/ ส่งต่อไป pvdesk ด้วย token ของ 65 (LE Admin)
โหมด MEMBER ส่ง MSCRMCallerID ของ 64 (LE Member) ให้เซิร์ฟเวอร์ตรวจสิทธิ์ตาม 64 จริง WhoAmI ตอบเป็น 64 (สูตรเดียวกับ Pending VAT Desk)
ใช้ (จากโฟลเดอร์ Claude Code):
  PVDESK_TOKEN=$(az account get-access-token --resource https://pvdesk.crm5.dynamics.com --query accessToken -o tsv) \\
    .venv/bin/python Log_Electric/desk/tests_web/le_ui.py
ผล PASS/FAIL ต่อข้อ ภาพหลักฐานลง EVID จบด้วยรหัส 1 ถ้ามีข้อตก
"""
import csv, io, json, os, pathlib, re, socket, subprocess, sys, time, urllib.parse, urllib.request
from openpyxl import load_workbook
from playwright.sync_api import sync_playwright

BASE = "https://pvdesk.crm5.dynamics.com"
TOKEN = os.environ.get("PVDESK_TOKEN", "")
DESK = pathlib.Path(__file__).resolve().parents[1]
REPO = DESK.parents[1]
EVID = pathlib.Path(os.environ.get("LE_EVID") or REPO / ".claude/evidence/2026-10-29-log-electric-desk")
FILES = DESK / "tests_web" / "files"
RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok)))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""), flush=True)


def dv(method, path, body=None, caller=None):
    url = urllib.parse.quote(f"{BASE}/api/data/v9.2/{path}", safe="/:?&=$,()'@%;+*!~#")
    h = {"Authorization": f"Bearer {TOKEN}", "Accept": "application/json", "Content-Type": "application/json", "OData-Version": "4.0",
         "Prefer": 'odata.include-annotations="*"'}
    if caller:
        h["MSCRMCallerID"] = caller
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    with urllib.request.urlopen(req) as r:
        t = r.read()
        return json.loads(t) if t else None


def count(caller=None, flt=""):
    q = "le_logelectrics?$select=le_logelectricid&$count=true" + ("&$filter=" + urllib.parse.quote(flt) if flt else "")
    return dv("GET", q, caller=caller)["@odata.count"]


def user_id(prefix):
    return dv("GET", "systemusers?$select=systemuserid&$filter=" + urllib.parse.quote(f"startswith(domainname,'{prefix}@')"))["value"][0]["systemuserid"]


class Server:
    def __init__(self):
        s = socket.socket(); s.bind(("127.0.0.1", 0)); self.port = s.getsockname()[1]; s.close()
        self.proc = subprocess.Popen([sys.executable, "-m", "http.server", str(self.port), "--bind", "127.0.0.1", "--directory", str(DESK)],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", self.port), 0.2).close(); break
            except OSError:
                time.sleep(0.1)
        self.url = f"http://127.0.0.1:{self.port}/web/index.html"


def open_page(browser, srv, caller=None, vp=(1440, 900), pre=None, device=None):
    """device = ค่าจำลองรุ่นจาก playwright.devices (จอ , ความคมจอ , สัมผัส , user agent) ใช้แทน vp"""
    if device:
        dev = {k: v for k, v in device.items() if k != "default_browser_type"}
        ctx = browser.new_context(**dev, accept_downloads=True, locale="th-TH")
    else:
        ctx = browser.new_context(viewport={"width": vp[0], "height": vp[1]}, accept_downloads=True, locale="th-TH", is_mobile=vp[0] < 500, has_touch=vp[0] < 500)
    page = ctx.new_page()
    page.errors = []
    page.on("console", lambda m: page.errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: page.errors.append("pageerror: " + str(e)))
    local = f"http://127.0.0.1:{srv.port}"

    def forward(route, request):
        url = request.url.replace(local, BASE, 1)
        if caller and url.endswith("/api/data/v9.2/WhoAmI"):
            return route.fulfill(status=200, content_type="application/json", body=json.dumps({"UserId": caller}))
        h = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "origin", "referer", "cookie")}
        h["Authorization"] = f"Bearer {TOKEN}"
        if caller:
            h["MSCRMCallerID"] = caller
        body = request.post_data_buffer
        if body and b"/api/data/v9.2/" in body:  # $batch ใช้ URL เต็มของ org ไม่ได้ ใช้แบบ path ก็พอ
            pass
        try:
            res = route.fetch(url=url, method=request.method, headers=h, post_data=body)
            route.fulfill(response=res)
        except Exception as e:  # หน้าถูกปิดระหว่างคำขอยังวิ่ง ปล่อยทิ้ง ไม่งั้นไปโผล่ตอนเปิดหน้าถัดไป (และข้อความ error พ่น header ที่มี token)
            if not any(w in str(e) for w in ("closed", "disposed")):
                raise RuntimeError(f"ส่งต่อคำขอไม่ได้ {request.method} {url.split('?')[0]} : {type(e).__name__} {str(e).splitlines()[0][:120]}") from None
    page.route(f"{local}/api/data/v9.2/**", forward)
    if pre:  # ดักคำขอบางตัวก่อนเปิดหน้า (ตัวที่ลงทะเบียนทีหลังทำงานก่อน)
        pre(page)
    page.goto(srv.url)
    page.wait_for_selector("body.app-ready, .boot-err", timeout=60000)
    return ctx, page


def upload(page, path):
    page.click("#tab-import")
    page.set_input_files("#imp-file", str(path))


TEST_PRO = re.compile(r"^(PRO1000\d\d|PRO-MEMBER-\d+|BUG-.*)$")


def foreign_rows():
    """แถวที่ไม่ได้มาจากเทส (เลข PRO ที่เทสสร้างเองมีแค่ PRO1000xx , PRO-MEMBER-n , BUG-) เช่นแถวที่พี่ปอนด์ลองนำเข้าเองบน pvdesk
    เจอแล้วห้ามกด Delete all (29/10 เทสลบแถว TEST.xlsx ของพี่ระหว่างพี่กำลังลองใช้)"""
    rows = dv("GET", "le_logelectrics?$select=le_pronumber,le_source")["value"]
    return [f"{r['le_pronumber']} ({r['le_source']})" for r in rows if not TEST_PRO.match(r["le_pronumber"] or "")]


def radio_check(p):
    """ปุ่มวงกลม And Or สีแดงแบบธีม TRUE (พี่ปอนด์ 29/10 รอบ 4 ภาพ #60)"""
    acc = p.evaluate("getComputedStyle(document.querySelector('.xf-pop .xf-join input[type=radio]')).accentColor")
    check("กล่องเงื่อนไข: ปุ่มวงกลม And Or สีแดง", acc == "rgb(224, 0, 0)", acc)


def date_tree_fit_check(p):
    """กางเดือนทุกเดือนในตัวกรองวันที่ กล่องต้องไม่ยืดเลยขอบจอล่าง ปุ่ม OK ต้องเห็นครบ (เห็นปุ่มโดนตัดในภาพ 29/10)"""
    p.click('#rec-table th[data-col="logBookDate"] .xf-btn', force=True)
    for t in p.eval_on_selector_all('.xf-pop [data-tog^="m:"]', "els => els.map(e => e.dataset.tog)"):
        p.click(f'.xf-pop [data-tog="{t}"]')
    m = p.evaluate("""() => { const q = document.querySelector('.xf-pop').getBoundingClientRect(), k = document.querySelector('.xf-pop .xf-ok').getBoundingClientRect();
      return { popBottom: Math.round(q.bottom), okBottom: Math.round(k.bottom), vh: innerHeight }; }""")
    check("ตัวกรองวันที่: กางทุกเดือนแล้วกล่องไม่ยืดเลยขอบจอล่าง ปุ่ม OK เห็นครบ", m["popBottom"] <= m["vh"] and m["okBottom"] <= m["popBottom"], str(m))
    p.keyboard.press("Escape")


def xf_tall_check(p, col="name"):
    """กล่องตัวกรองแบบ Excel: ไม่มีแถบเลื่อนของตัวกล่อง ยืดลงไปใช้พื้นที่ถึงขอบจอล่าง เลื่อนเฉพาะรายการค่า (พี่ปอนด์ 29/10 ภาพ #73)"""
    p.click(f'#rec-table th[data-col="{col}"] .xf-btn', force=True); p.wait_for_timeout(200)
    m = p.evaluate("""() => { const pop = document.querySelector('.xf-pop'), q = pop.getBoundingClientRect(), l = document.querySelector('.xf-pop .xf-list'), lr = l.getBoundingClientRect();
      const content = [...l.children].reduce((a, e) => a + e.offsetHeight, 0);
      return { popScroll: pop.scrollHeight > pop.clientHeight + 1, popBottom: Math.round(q.bottom), vh: innerHeight, list: Math.round(lr.height), content }; }""")
    ok = not m["popScroll"] and m["popBottom"] <= m["vh"] and (m["list"] >= m["content"] or m["popBottom"] >= m["vh"] - 20)
    check(f"กล่องตัวกรอง {col} จอสูง {m['vh']}: ไม่มีแถบเลื่อนของกล่อง และรายการเห็นครบหรือกล่องยืดถึงขอบล่าง", ok, str(m))
    p.keyboard.press("Escape")


def xf_list_check(p):
    p.click('#rec-table th[data-col="siteCode"] .xf-btn')
    m = p.evaluate("""() => { const l = document.querySelector('.xf-pop .xf-list'), q = document.querySelector('.xf-pop').getBoundingClientRect(), k = document.querySelector('.xf-pop .xf-ok').getBoundingClientRect();
      const lr = l.getBoundingClientRect(), f = document.querySelector('.xf-pop .xf-foot').getBoundingClientRect();
      return { list: Math.round(Math.min(lr.bottom, f.top, q.bottom) - Math.max(lr.top, q.top)), full: [...l.children].reduce((a, e) => a + e.offsetHeight, 0), popScroll: q.height < document.querySelector('.xf-pop').scrollHeight, popBottom: Math.round(q.bottom), popTop: Math.round(q.top), okBottom: Math.round(k.bottom), vh: innerHeight }; }""")
    p.screenshot(path=str(EVID / "13_filter_short_screen.png"))
    check("จอโน้ตบุ๊กในกรอบ MDA (600px) รายการในกล่องตัวกรองเห็นได้จริงอย่างน้อย 200px (ราว 9 แถว) หรือเห็นครบ กล่องไม่ล้นต้องเลื่อน ปุ่ม OK อยู่ในกล่องและในจอ (พี่ปอนด์ขอยาวขึ้น ภาพ #66)", m["list"] >= min(m["full"], 200) - 2 and not m["popScroll"]
          and m["popTop"] >= 0 and m["popBottom"] <= m["vh"] and m["okBottom"] <= m["popBottom"], str(m))
    p.keyboard.press("Escape")


def main():
    if not TOKEN:
        print("ไม่มี PVDESK_TOKEN"); sys.exit(2)
    EVID.mkdir(parents=True, exist_ok=True)
    u64, u65 = user_id("64050580"), user_id("65050782")
    srv = Server()
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            # ---------- ADMIN (65) ----------
            ctx, p = open_page(b, srv)
            check("65 เปิดแอปเป็น Admin", "Admin" in p.inner_text("#my-role"), p.inner_text("#my-role"))
            check("Admin เห็นแท็บ Settings และไม่มีแท็บ Dashboard แล้ว", p.is_visible("#tab-settings") and not p.query_selector("#tab-dashboard"))
            check("แถบบนขวาเขียนแค่ชื่อบทบาท", p.inner_text("#my-role") == "Admin", p.inner_text("#my-role"))
            check("หน้าตารางไม่มีปุ่ม Import แล้ว (ใช้แท็บ)", not p.query_selector("#btn-import"))
            other = foreign_rows()
            if other:
                print("หยุด: บน pvdesk มีแถวที่ไม่ใช่ของเทส ไม่กด Delete all ให้ ถามพี่ปอนด์ก่อน: " + " , ".join(other[:10]) + (f" และอีก {len(other) - 10}" if len(other) > 10 else ""))
                sys.exit(2)
            # เริ่มจากตารางว่าง (ลบของรอบก่อนด้วยปุ่มของแอป ทดสอบปุ่มลบทั้งหมดไปด้วย)
            if count() > 0:
                p.click("#tab-settings")
                p.fill("#del-confirm", "DELETE ALL")
                p.click("#btn-del-all")
                p.click("dialog.dlg .btn.dark")
                p.wait_for_function("() => (document.querySelector('#toast')?.innerText || '').includes('Deleted')", timeout=180000)
            check("ปุ่มลบทั้งหมดของ Admin ทำให้ตารางว่าง", count() == 0, f"เหลือ {count()}")
            p.click("#tab-settings")
            p.wait_for_selector("#delete-card")
            check("แท็บเขียนว่า Settings หัวหน้าก็ Settings", p.inner_text("#tab-settings").strip() == "Settings" and p.inner_text("#settings .page-h") == "Settings")
            check("หน้า Settings ไม่มีการ์ดตั้งเลข INDEX แล้ว (แอปตั้งเริ่ม 1 เอง)", not p.query_selector("#seed-card") and not p.query_selector("#btn-seed"))
            roles = p.inner_text("#roles-card")
            check("การ์ดบทบาทเป็นอังกฤษ บอกว่าใครลบได้ไม่ได้ ไม่มีตัวหนาในรายการ (พี่ปอนด์ 29/10 รอบ 4)", roles.count("cannot delete") == 2 and "can delete any row" in roles
                  and not p.query_selector("#roles-card li b"), roles.replace("\n", " "))
            check("หน้า Admin ไม่มีขอบแดงที่การ์ด", p.evaluate("getComputedStyle(document.querySelector('#delete-card')).boxShadow") == "none")
            p.screenshot(path=str(EVID / "00_admin_seed.png"))
            # เทมเพลต
            p.click("#tab-import")
            with p.expect_download() as d:
                p.click("#btn-template")
            tpl = EVID / "template.xlsx"
            d.value.save_as(tpl)
            wb = load_workbook(tpl)
            heads = [c.value for c in wb["LOG ELECTRIC"][1]]
            check("เทมเพลตมีเฉพาะช่องที่ต้องกรอก ไม่มี INDEX ไม่มี AUTO", heads[0] == "LOG BOOK DATE" and "INDEX" not in heads and "COMPANY NAME" not in heads
                  and "SITE CODE NO CANDIDATE" not in heads and len(heads) == 13, str(heads))
            check("เทมเพลตมี dropdown 4 ช่อง", sum(1 for v in wb["LOG ELECTRIC"].data_validations.dataValidation if v.type == "list") == 4)
            ex2 = [c.value for c in wb["LOG ELECTRIC"][2]]
            check("เทมเพลตมีแถวตัวอย่าง 1 แถว (แถว 2) วันที่เป็นวันที่ เงินเป็นตัวเลข", ex2[1] == "PRO Group" and hasattr(ex2[0], "year") and ex2[5] == 2021.54
                  and wb["LOG ELECTRIC"].max_row == 2, str(ex2))
            g = wb["How to fill"]
            check("ชีต How to fill ตามแบบพี่ ช่อง Type ของ dropdown เขียน Text (Dropdown) ตัวอย่างครบ", g["C8"].value == "Text (Dropdown)" and g["E9"].value == "Patcharasit Pongudom"
                  and g["E10"].value == "Jirachaya Rachpolsaen" and g["E3"].value == "PRO Group" and all(g.cell(r, 5).value not in (None, "") for r in range(2, 15)), f"{g['C8'].value} {g['E9'].value} {g['E10'].value}")
            upload(p, tpl)
            p.wait_for_selector("#imp-only-example, #imp-ready, #imp-rejected")
            check("อัปโหลดเทมเพลตที่มีแค่แถวตัวอย่าง บอกให้แทนด้วยข้อมูลจริง ไม่บันทึกอะไร", p.is_visible("#imp-only-example") and count() == 0)
            # ไฟล์ผิด
            with p.expect_download() as d:
                upload(p, FILES / "bad.xlsx")
            p.wait_for_selector("#imp-rejected")
            errf = EVID / "bad_errors.xlsx"
            d.value.save_as(errf)
            ws = load_workbook(errf).active
            head = [c.value for c in ws[1]]
            err = {r[0].row: r[head.index("ERROR")].value for r in ws.iter_rows(min_row=2) if r[head.index("ERROR")].value}
            check("ไฟล์ผิดถูกตีกลับ ไม่มีอะไรถูกบันทึก", count() == 0)
            check("ไฟล์ error บอกแถวผิดครบ 4 แถว (3, 4, 5, 6)", sorted(err) == [3, 4, 5, 6], str(sorted(err)))
            check("แถว 3 บอก AMOUNT พร้อมค่าที่ใส่", "AMOUNT" in (err.get(3) or "") and "สองพัน" in err.get(3, ""), err.get(3))
            # ลงสีไฟล์ error (พี่ปอนด์ 29/10 รอบ 4 ภาพ #56 ถึง #58)
            fg = lambda ref: (ws[ref].fill.fgColor.rgb if ws[ref].fill and ws[ref].fill.fill_type == "solid" else None)
            ec = head.index("ERROR") + 1
            from openpyxl.utils import get_column_letter as gcl
            E = gcl(ec)
            check("ไฟล์ error หัว ERROR แดงตัวขาว ช่อง ERROR ชมพูอ่อนตัวแดงหนา", fg(f"{E}1") == "FFC00000" and ws[f"{E}1"].font.color.rgb == "FFFFFFFF"
                  and fg(f"{E}3") == "FFFFF0F0" and ws[f"{E}3"].font.b and ws[f"{E}3"].font.color.rgb == "FFC00000", f"{fg(E + '1')} {fg(E + '3')}")
            check("ไฟล์ error หัวคอลัมน์สีแบบเทมเพลต บังคับชมพู ไม่บังคับเทา", fg("A1") == "FFFDECEC" and ws["A1"].font.color.rgb == "FFA80000" and fg("L1") == "FFF2F2F2" and fg("M1") == "FFF2F2F2",
                  f"A1 {fg('A1')} L1 {fg('L1')}")
            check("ไฟล์ error ช่องที่ผิดแดงอ่อน (AMOUNT แถว 3 , LOG BOOK DATE ว่างแถว 5) ช่องที่ถูกไม่ลงสี", fg("F3") == "FFFDECEC" and fg("A5") == "FFFDECEC" and fg("C5") == "FFFDECEC"
                  and fg("B3") is None and fg("F2") is None, f"F3 {fg('F3')} A5 {fg('A5')} B3 {fg('B3')}")
            check("ไฟล์ error วันที่ในแถวที่ถูกยังเป็นวันที่", hasattr(ws["A2"].value, "year") and "yy" in ws["A2"].number_format, f"{ws['A2'].value} {ws['A2'].number_format}")
            check("แถว 4 บอก TEAM DTAC", "TEAM" in (err.get(4) or "") and "DTAC" in err.get(4, ""), err.get(4))
            check("แถว 5 บอกทั้ง LOG BOOK DATE และ SITE CODE", "LOG BOOK DATE" in (err.get(5) or "") and "SITE CODE CANDIDATE" in err.get(5, ""), err.get(5))
            check("แถว 6 บอก COMPANY CODE", "COMPANY CODE" in (err.get(6) or ""), err.get(6))
            p.screenshot(path=str(EVID / "01_import_rejected.png"), full_page=True)
            # แก้ไฟล์ error แล้วอัปโหลดกลับ (ลบคอลัมน์ ERROR ไม่ต้อง ระบบไม่สนคอลัมน์เกิน)
            wbe = load_workbook(errf); wse = wbe.active
            col = {c.value: c.column for c in wse[1]}
            wse.cell(3, col["AMOUNT"], 2000); wse.cell(4, col["TEAM"], "IBC"); wse.cell(5, col["LOG BOOK DATE"], "29/10/2026")
            wse.cell(5, col["SITE CODE CANDIDATE"], "BKK1234A"); wse.cell(6, col["COMPANY CODE"], "1019")
            fixed = EVID / "bad_fixed.xlsx"; wbe.save(fixed)
            upload(p, fixed)
            p.wait_for_selector("#imp-ready")
            check("ไฟล์ error ที่แก้แล้วอัปโหลดกลับผ่าน", "All 6 rows are valid" in p.inner_text("#imp-ready"))
            # ไฟล์ถูก 40 แถว
            upload(p, FILES / "good.xlsx")
            p.wait_for_selector("#imp-ready")
            p.screenshot(path=str(EVID / "02_import_ready.png"), full_page=True)
            p.click("#btn-confirm-import")
            p.click("dialog.dlg .btn.dark")
            p.wait_for_selector("#imp-done", timeout=180000)
            n = count()
            check("นำเข้า 40 แถวลง Dataverse จริง", n == 40, f"Dataverse มี {n}")
            # นำเข้าสำเร็จต้องดูเป็นการฉลอง (พี่ปอนด์ 29/10 รอบ 4 ภาพ #59)
            p.wait_for_timeout(700); p.screenshot(path=str(EVID / "15_import_done.png"))
            cel = p.evaluate("""() => ({ title: document.querySelector('#imp-done .done-title')?.innerText, check: !!document.querySelector('#imp-done svg.done-check'),
              confetti: document.querySelectorAll('#imp-done .confetti i').length, kind: document.querySelector('#toast')?.dataset.kind,
              ticon: !!document.querySelector('#toast .toast-ic'), toast: document.querySelector('#toast .toast-msg')?.innerText })""")
            check("นำเข้าสำเร็จ ขึ้นการ์ดฉลอง เครื่องหมายถูก กระดาษสีฟ้าแดงเหลือง และ toast สีเขียวมีไอคอน", cel["title"] == "Imported 40 rows" and cel["check"] and cel["confetti"] >= 12
                  and cel["kind"] == "success" and cel["ticon"] and cel["toast"] == "Imported 40 rows", json.dumps(cel, ensure_ascii=False))
            p.click("#imp-view")
            check("ปุ่ม View records พาไปแท็บ Records", p.get_attribute("#tab-records", "aria-selected") == "true")
            row = dv("GET", "le_logelectrics?$select=le_index,le_sitecode,le_sitecodenocand,le_companycode,le_companyname,le_source&$filter=le_pronumber eq 'PRO100000'")["value"][0]
            check("INDEX ออกเลขเอง และช่อง AUTO ถูกเติม", row["le_index"] and row["le_sitecodenocand"] and row["le_source"] == "good.xlsx", json.dumps({k: row[k] for k in ("le_index", "le_sitecode", "le_sitecodenocand", "le_companycode", "le_companyname")}, ensure_ascii=False))
            idx = sorted(int(r["le_index"]) for r in dv("GET", "le_logelectrics?$select=le_index")["value"])
            check("INDEX เป็นเลขเรียง 1 ถึง 40", idx == list(range(1, 41)), f"{idx[0]}..{idx[-1]}")
            # ตาราง ตัวกรอง Group by ส่งออก
            p.click("#tab-records")
            p.wait_for_selector("#rec-table tbody tr[data-id]")
            hs = p.eval_on_selector_all("#rec-table tbody tr[data-id]", "els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().height)))]")
            check("แถวในตารางสูงเท่ากันทุกแถว (ข้อความยาวไม่ขึ้นบรรทัดใหม่)", len(hs) == 1, str(hs))
            check("ตารางแสดง 40 แถว", "40" in p.inner_text("#rec-summary"), p.inner_text("#rec-summary"))
            heads = p.eval_on_selector_all("#rec-table th", "els => els.map(e => e.dataset.col)")
            check("ตารางมี INDEX, CREATED ON/BY, UPDATED ON/BY, HISTORY", all(k in heads for k in ("index", "createdOn", "createdBy", "modifiedOn", "modifiedBy", "edits")), str(heads))
            # ตรึงคอลัมน์ (พี่ปอนด์ 29/10 รอบ 2 ภาพ #35)
            p.wait_for_selector('#rec-table th.frz-last[data-col="proNumber"]')
            p.eval_on_selector("#rec-table", "e => e.scrollLeft = 5000")
            p.wait_for_timeout(300)
            pos = p.evaluate("""() => { const w = document.querySelector('#rec-table').getBoundingClientRect();
              const a = document.querySelector('#rec-table th[data-col="index"]').getBoundingClientRect();
              const b = document.querySelector('#rec-table tbody tr[data-id] td:nth-child(3)').getBoundingClientRect();
              return { scrolled: document.querySelector('#rec-table').scrollLeft, idx: Math.round(a.left - w.left), pro: Math.round(b.left - w.left) }; }""")
            check("ค่าเริ่มตรึง INDEX ถึง PRO NUMBER เลื่อนขวาสุดแล้วยังอยู่ซ้าย", pos["scrolled"] > 200 and pos["idx"] <= 2 and pos["pro"] < 300, str(pos))
            p.screenshot(path=str(EVID / "03a_freeze_scrolled.png"))
            p.eval_on_selector("#rec-table", "e => e.scrollLeft = 0")
            p.hover('#rec-table th[data-col="siteCode"]')
            p.click('#rec-table th[data-col="siteCode"] .xf-btn')
            p.click('.xf-pop [data-freeze="siteCode"]')
            check("เลือก Freeze up to this column ที่ SITE CODE ได้", p.query_selector('#rec-table th.frz-last[data-col="siteCode"]') is not None)
            p.hover('#rec-table th[data-col="team"]')
            p.click('#rec-table th[data-col="team"] .xf-btn')
            p.click(".xf-pop [data-unfreeze]")
            check("Unfreeze columns แล้วไม่มีคอลัมน์ตรึง", not p.query_selector("#rec-table .frz"))
            p.evaluate("localStorage.removeItem('le.freeze')")
            p.reload(); p.wait_for_selector('#rec-table th.frz-last[data-col="proNumber"]')
            # ลากขยายคอลัมน์ (พี่ปอนด์ 29/10 รอบ 3 ภาพ #49)
            wof = lambda k: p.evaluate(f"Math.round(document.querySelector('#rec-table th[data-col=\"{k}\"]').getBoundingClientRect().width)")
            def drag(k, dx):
                loc = p.locator(f'#rec-table th[data-col="{k}"] .col-rs'); loc.scroll_into_view_if_needed()
                g = loc.bounding_box()
                x, y = g["x"] + g["width"] / 2, g["y"] + g["height"] / 2
                p.mouse.move(x, y); p.mouse.down(); p.mouse.move(x + dx / 2, y); p.mouse.move(x + dx, y); p.mouse.up()
                p.wait_for_timeout(300)
            p.evaluate("document.querySelector('#rec-table').scrollLeft = 0")
            w0 = wof("name"); drag("name", 150); w1 = wof("name")
            tdw = p.evaluate("Math.round(document.querySelector('#rec-table td[data-c=\"name\"]').getBoundingClientRect().width)")
            check("ลากขอบ NAME ไปขวา 150px คอลัมน์กว้างขึ้นทั้งหัวและช่อง", abs(w1 - w0 - 150) <= 4 and abs(tdw - w1) <= 1, f"{w0} -> {w1} td {tdw}")
            p.reload(); p.wait_for_selector("#rec-table tbody tr[data-id]")
            check("เปิดใหม่ ความกว้างที่ลากไว้ยังอยู่", abs(wof("name") - w1) <= 2, f"{wof('name')} / {w1}")
            p.dblclick('#rec-table th[data-col="name"] .col-rs'); p.wait_for_timeout(300)
            check("ดับเบิลคลิกขอบ คอลัมน์กลับเป็นอัตโนมัติ", abs(wof("name") - w0) <= 4, f"{wof('name')} / {w0}")
            drag("proNumber", 80)
            pos = p.evaluate("""() => { const a = document.querySelector('#rec-table th[data-col="proNumber"]').getBoundingClientRect(); const b = document.querySelector('#rec-table th[data-col="siteCode"]').getBoundingClientRect();
              const c = document.querySelector('#rec-table td[data-c="proNumber"]').getBoundingClientRect(); return { proRight: Math.round(a.right), siteLeft: Math.round(b.left), tdLeft: Math.round(c.left), thLeft: Math.round(a.left) }; }""")
            check("ลากขยายคอลัมน์ที่ตรึง (PRO NUMBER) แล้วคอลัมน์ถัดไปต่อพอดี ไม่ซ้อนกัน", abs(pos["proRight"] - pos["siteLeft"]) <= 1 and pos["tdLeft"] == pos["thLeft"], str(pos))
            p.evaluate("localStorage.removeItem('le.widths')"); p.reload(); p.wait_for_selector("#rec-table tbody tr[data-id]")
            p.screenshot(path=str(EVID / "03e_resize.png"))
            # Go to column แบบ Power Query (พี่ปอนด์ 29/10 รอบ 2 ภาพ #37)
            p.click("#rec-search")
            p.keyboard.press("Control+g")
            p.wait_for_selector("#goto-dlg[open]")
            p.keyboard.type("rem")
            check("Go to column: พิมพ์ rem เหลือ REMARK ตัวเดียว", p.eval_on_selector_all("#goto-list .goto-item", "els => els.map(e => e.innerText)") == ["REMARK"])
            p.keyboard.press("Enter")
            p.wait_for_timeout(300)
            v = p.evaluate("""() => { const w = document.querySelector('#rec-table').getBoundingClientRect(); const fr = document.querySelector('#rec-table thead th.frz-last').getBoundingClientRect();
              const t = document.querySelector('#rec-table th[data-col="remark"]').getBoundingClientRect(); return { left: Math.round(t.left), right: Math.round(t.right), frz: Math.round(fr.right), wrap: Math.round(w.right),
              flash: document.querySelector('#rec-table th[data-col="remark"]').classList.contains('col-flash') }; }""")
            check("Go to column: Enter แล้วเลื่อนให้ REMARK อยู่ในจอ ถัดจากคอลัมน์ที่ตรึง และไฮไลต์", v["left"] >= v["frz"] - 1 and v["right"] <= v["wrap"] and v["flash"], str(v))
            p.screenshot(path=str(EVID / "03c_goto_remark.png"))
            col = p.evaluate("""() => { const c = (s) => getComputedStyle(document.querySelector(s)).backgroundColor; return { th: c('#rec-table th[data-col="remark"]'), td: c('#rec-table tbody tr[data-id] td.col-flash') }; }""")
            green = lambda rgb: (lambda v: v[1] > v[0] and v[1] > v[2])([int(x) for x in rgb[rgb.index("(") + 1:rgb.index(")")].split(",")[:3]])
            check("Go to column: ไฮไลต์เขียวอ่อนแบบ Excel ทั้งหัวและช่อง", green(col["th"]) and green(col["td"]), str(col))
            p.mouse.click(5, 5)
            check("Go to column: คลิกที่อื่นแล้วไฮไลต์หาย", not p.query_selector("#rec-table .col-flash"))
            check("ปุ่ม Go to column ไม่มีป้าย Ctrl+G บนปุ่ม", p.inner_text("#btn-goto").strip() == "Go to column", p.inner_text("#btn-goto"))
            p.click("#btn-goto")
            p.click("#goto-az")
            first = p.inner_text("#goto-list .goto-item")
            check("Go to column: ปุ่ม A↓Z เรียงชื่อคอลัมน์", first == "ACCOUNTANT", first)
            p.screenshot(path=str(EVID / "03d_goto_dialog.png"))
            p.keyboard.press("Escape")
            p.eval_on_selector("#rec-table", "e => e.scrollLeft = 0")
            ibc = count(flt="le_team eq 'IBC'")
            p.hover('#rec-table th[data-col="team"]')
            p.click('#rec-table th[data-col="team"] .xf-btn')
            p.click(".xf-pop .xf-all")
            p.click('.xf-pop input[data-v="IBC"]')
            p.click(".xf-pop .xf-ok")
            s = p.inner_text("#rec-summary")
            check("ตัวกรองแบบ Excel TEAM = IBC ได้จำนวนตรง Dataverse", s.startswith(str(ibc)), f"{s} / Dataverse {ibc}")
            p.screenshot(path=str(EVID / "03_filter_ibc.png"))
            # กล่องเงื่อนไขของตัวกรองต้องไม่ติดกัน (พี่ปอนด์ 29/10 รอบ 2 ภาพ #34)
            p.click('#rec-table th[data-col="index"] .xf-btn', force=True)
            p.click(".xf-pop .xf-cond-menu")
            p.click('.xf-pop [data-op="between"]')
            g = p.evaluate("""() => { const r = (s) => document.querySelector(s).getBoundingClientRect();
              const a = r('.xf-op1'), b = r('.xf-v1'), c = r('.xf-op2'), j = r('.xf-join');
              return { side: Math.round(b.left - a.right), sameRow: Math.abs(a.top - b.top) < 2, gapJoin: Math.round(j.top - Math.max(a.bottom, b.bottom)), gapRow2: Math.round(c.top - j.bottom) }; }""")
            check("กล่องเงื่อนไข: ช่องเลือกกับช่องค่าอยู่แถวเดียวกัน ห่างกันอย่างน้อย 8px", g["sameRow"] and g["side"] >= 8, str(g))
            check("กล่องเงื่อนไข: And Or ห่างจากแถวบนล่างอย่างน้อย 10px", g["gapJoin"] >= 10 and g["gapRow2"] >= 10, str(g))
            fit = p.evaluate("""() => { const s = document.querySelector('.xf-op1'); const cs = getComputedStyle(s); const cv = document.createElement('canvas').getContext('2d');
              cv.font = cs.fontSize + ' ' + cs.fontFamily; return { text: Math.ceil(cv.measureText(s.selectedOptions[0].text).width), room: s.clientWidth - parseFloat(cs.paddingLeft) - 24 }; }""")
            check("กล่องเงื่อนไข: คำว่า Greater than or equal to ไม่โดนตัด", fit["text"] <= fit["room"], str(fit))
            p.screenshot(path=str(EVID / "03b_condition_filter.png"))
            check("กล่องเงื่อนไข: ไม่มีคำอธิบาย Not case-sensitive หรือ Compared as numbers", "case-sensitive" not in p.inner_text(".xf-pop") and "Compared as numbers" not in p.inner_text(".xf-pop"))
            okbg = p.evaluate("getComputedStyle(document.querySelector('.xf-pop .xf-ok')).backgroundColor")
            check("กล่องเงื่อนไข: ปุ่ม OK ไม่ใช่สีแดง", okbg not in ("rgb(224, 0, 0)", "rgb(168, 0, 0)"), okbg)
            radio_check(p)
            p.keyboard.press("Escape")
            p.select_option("#rec-group", "system")
            groups = p.eval_on_selector_all("#rec-table tr.grp", "els => els.map(e => e.dataset.group)")
            check("Group by SYSTEM ขึ้นหัวกลุ่ม", set(groups) <= {"SITE RENTAL", "DASHBOARD"} and len(groups) >= 1, str(groups))
            p.click("#rec-table tr.grp .grp-btn")
            gs = p.evaluate("""() => { const t = document.querySelector('#rec-table'); t.scrollLeft = 600; const w = t.getBoundingClientRect(); const g = document.querySelector('#rec-table tr.grp .grp-sum').getBoundingClientRect(); const b = document.querySelector('#rec-table tr.grp .grp-btn b').getBoundingClientRect();
              return { scrolled: t.scrollLeft, nameLeft: Math.round(b.left), sumRight: Math.round(g.right), wl: Math.round(w.left), wr: Math.round(w.right) }; }""")
            check("Group by: เลื่อนตารางขวาแล้ว ชื่อกลุ่มกับยอดรวมยังอยู่ในจอ", gs["scrolled"] > 0 and gs["nameLeft"] >= gs["wl"] and gs["sumRight"] <= gs["wr"], str(gs))
            p.eval_on_selector("#rec-table", "e => e.scrollLeft = 0")
            p.screenshot(path=str(EVID / "04_groupby.png"))
            p.select_option("#rec-group", "")
            p.click("#btn-export")
            p.check('#export-dlg input[data-fmt="csv"]')
            files = []
            p.on("download", lambda dl: files.append(dl))
            p.click("#export-go")
            p.wait_for_timeout(2500)
            got = {}
            for dl in files:
                path = EVID / ("export_admin_ibc" + pathlib.Path(dl.suggested_filename).suffix)
                dl.save_as(path); got[path.suffix] = path
            check("ส่งออกติ๊กได้ทั้ง XLSX และ CSV พร้อมกัน", set(got) == {".xlsx", ".csv"}, str(list(got)))
            if ".xlsx" in got:
                wsx = load_workbook(got[".xlsx"]).active
                hx = [c.value for c in wsx[1]]
                teams = {r[hx.index("TEAM")].value for r in wsx.iter_rows(min_row=2)}
                check("XLSX ส่งออกตามตัวกรอง (แถวตรง และเป็น IBC ทั้งหมด)", wsx.max_row - 1 == ibc and teams == {"IBC"}, f"{wsx.max_row - 1} แถว {teams}")
            if ".csv" in got:
                rows = list(csv.reader(io.StringIO(got[".csv"].read_text(encoding="utf-8-sig"))))
                check("CSV ส่งออกตามตัวกรอง มี BOM อ่านไทยได้", len(rows) - 1 == ibc, f"{len(rows) - 1} แถว")
            p.click("#rec-clear")
            # ข้อความบนจอเป็นอังกฤษหมด ยกเว้นการ์ดบทบาทและข้อมูลในตาราง
            thai = p.evaluate("""() => { const out = []; const skip = (el) => el.closest('tbody, .kv dd, .hist, .chip, .xf-list');
              const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              while (w.nextNode()) { const n = w.currentNode; if (/[\u0E00-\u0E7F]/.test(n.textContent) && n.parentElement && !skip(n.parentElement) && n.parentElement.offsetParent !== null) out.push(n.textContent.trim().slice(0, 40)); }
              return out; }""")
            for tab in ("#tab-import", "#tab-settings", "#tab-records"):
                p.click(tab)
                thai += p.evaluate("""() => [...document.querySelectorAll('main *')].filter(e => !e.closest('tbody') && e.children.length === 0 && /[\u0E00-\u0E7F]/.test(e.textContent)).map(e => e.textContent.trim().slice(0, 40))""")
            p.click("#tab-import")
            steps = p.eval_on_selector_all(".step-n", "els => els.map(e => e.innerText)")
            check("เลขขั้นในหน้า Import เป็น 01 02 ไม่มี / นำหน้า", steps == ["01", "02"], str(steps))
            p.click("#tab-records")
            check("ปุ่มและข้อความบนจอเป็นภาษาอังกฤษทั้งหมด รวมการ์ดบทบาท", not thai, " | ".join(thai[:6]))
            # นำเข้าไฟล์ CSV
            p.click("#tab-import")
            p.set_input_files("#imp-file", str(FILES / "good.csv"))
            p.wait_for_selector("#imp-ready, #imp-rejected, #imp-noheader")
            check("ไฟล์ CSV อ่านได้ ตรวจผ่านทุกแถว", p.is_visible("#imp-ready") and "All 5 rows are valid" in p.inner_text("#imp-ready"), p.inner_text("#imp-result")[:200])
            p.click("#tab-records")
            check("หน้า Admin ไม่มี error ในคอนโซล", not p.errors, "; ".join(p.errors[:3]))
            ctx.close()

            # ---------- MEMBER (64) ----------
            ctx, p = open_page(b, srv, caller=u64)
            check("64 เปิดแอปเป็น Member", "Member" in p.inner_text("#my-role"), p.inner_text("#my-role"))
            check("Member ไม่เห็นแท็บ Dashboard และ Settings", not p.is_visible("#tab-dashboard") and not p.is_visible("#tab-settings"))
            check("Member ไม่เห็นแถวของ 65 (40 แถว)", p.inner_text("#rec-summary").startswith("0"), p.inner_text("#rec-summary"))
            p.click("#btn-add")
            p.click("#btn-save")
            check("ฟอร์มว่างกดบันทึก ขึ้นข้อความต้องกรอก", p.inner_text("#e-amount") == "Required")
            p.fill("#f-logBookDate", "28/10/2026"); p.fill("#f-proNumber", "PRO-MEMBER-1"); p.fill("#f-siteCode", "cmi9012ti")
            p.fill("#f-name", "ผู้ให้เช่าของ 64"); p.fill("#f-dueDate", "15/11/2026"); p.fill("#f-amount", "1,500.50")
            p.select_option("#f-paymentMethod", "CHEQUE"); p.fill("#f-accountant", "Acc 64"); p.fill("#f-requestor", "Req 64")
            p.select_option("#f-team", "ONLINE"); p.select_option("#f-system", "DASHBOARD"); p.select_option("#f-companyCode", "1069")
            check("ฟอร์มโชว์ค่า AUTO ก่อนบันทึก", "CMI9012" in p.inner_text("#auto-note") and "BFKT" in p.inner_text("#auto-note"), p.inner_text("#auto-note"))
            p.screenshot(path=str(EVID / "06_member_form.png"))
            p.click("#btn-save")
            p.wait_for_selector("#rec-table tbody tr[data-id]")
            mine = dv("GET", "le_logelectrics?$select=le_logelectricid,_ownerid_value,le_amount,le_sitecodenocand&$filter=le_pronumber eq 'PRO-MEMBER-1'")["value"]
            check("แถวที่ 64 กรอกเป็นของ 64 ค่าถูก", len(mine) == 1 and mine[0]["_ownerid_value"] == u64 and float(mine[0]["le_amount"]) == 1500.5 and mine[0]["le_sitecodenocand"] == "CMI9012", json.dumps(mine, ensure_ascii=False)[:200])
            check("Dataverse ยืนยัน 64 อ่านได้ 1 แถว (65 อ่านได้ 41)", count(caller=u64) == 1 and count() == 41, f"64={count(caller=u64)} 65={count()}")
            # แก้แถว แล้วดูประวัติ
            p.click("#rec-table tbody tr[data-id]")
            p.click("#btn-edit")
            p.fill("#f-amount", "1750"); p.select_option("#f-team", "IBC")
            p.click("#btn-save")
            p.wait_for_selector("#hist-list .diff")
            hist = p.inner_text("#hist-list")
            check("ประวัติแสดงค่าเดิมเป็นค่าใหม่ AMOUNT และ TEAM", "1,500.50" in hist and "1,750.00" in hist and "ONLINE" in hist and "IBC" in hist, hist.replace("\n", " ")[:200])
            p.screenshot(path=str(EVID / "07_member_history.png"))
            # บัคที่เห็นจากภาพรอบแรก 29/10
            check("ท้ายแผงของ Member ไม่มีคำว่า null", "null" not in p.inner_text("#rec-panel .sp-foot"), p.inner_text("#rec-panel .sp-foot"))
            check("กล่องตัวกรองที่ปิดอยู่ไม่โผล่บนจอ", p.evaluate("getComputedStyle(document.querySelector('.xf-pop')).display") == "none")
            idx_txt = p.inner_text("#rec-table tbody tr[data-id] td:first-child")
            check("INDEX ไม่มีจุลภาค", "," not in idx_txt and idx_txt.isdigit(), idx_txt)
            h64 = dv("GET", "le_histories?$select=le_changes,_ownerid_value", caller=u64)["value"]
            check("แถวประวัติเป็นของ 64 อ่านเองได้", len(h64) == 1 and h64[0]["_ownerid_value"] == u64, str(len(h64)))
            check("คอลัมน์ HISTORY ในตารางขึ้น แก้ 1 ครั้ง", "1 edit" in p.inner_text("#rec-table"))
            check("UPDATED BY เป็นชื่อ 64", "Patcharasit" in p.inner_text("#rec-table"))
            # Member ส่งออก ได้แค่แถวตัวเอง
            files.clear()
            p.on("download", lambda dl: files.append(dl))
            p.click("#btn-export")
            p.click("#export-go")
            p.wait_for_timeout(2000)
            if files:
                path = EVID / "export_member.xlsx"; files[-1].save_as(path)
                check("Member ส่งออกได้แค่ 1 แถวของตัวเอง", load_workbook(path).active.max_row - 1 == 1)
            else:
                check("Member ส่งออกได้แค่ 1 แถวของตัวเอง", False, "ไม่มีไฟล์")
            # Member ลบไม่ได้แม้ยิงตรง
            try:
                dv("DELETE", f"le_logelectrics({mine[0]['le_logelectricid']})", caller=u64)
                check("Member ลบแถวไม่ได้ (Dataverse ปฏิเสธ)", False, "ลบได้")
            except urllib.error.HTTPError as e:
                check("Member ลบแถวไม่ได้ (Dataverse ปฏิเสธ)", e.code == 403, str(e.code))
            check("หน้า Member ไม่มี error ในคอนโซล", not p.errors, "; ".join(p.errors[:3]))
            ctx.close()

            # เปิดใหม่ (cold) จำนวนครั้งที่แก้ต้องมาจาก Dataverse ไม่ใช่ตัวนับในหน้าเดิม
            ctx, p = open_page(b, srv, caller=u64)
            p.wait_for_selector("#rec-table tbody tr[data-id]")
            check("เปิดใหม่ คอลัมน์ HISTORY ยังขึ้น แก้ 1 ครั้ง (นับจาก Dataverse)", "1 edit" in p.inner_text("#rec-table"))
            check("เปิดใหม่ไม่มี error ในคอนโซล", not p.errors, "; ".join(p.errors[:3]))
            ctx.close()

            # ---------- Admin สลับดูแบบ Member, Manager, Admin (พี่ปอนด์ 29/10 รอบ 4) ----------
            ctx, p = open_page(b, srv)
            n_all, n_65 = count(), count(flt=f"_ownerid_value eq {u65}")
            def view(r):
                p.click("#my-role"); p.click(f'#role-menu [data-role="{r}"]'); p.wait_for_timeout(300)
            check("เปิดมาเป็น Admin เห็นทุกแถว", p.inner_text("#my-role") == "Admin" and p.inner_text("#rec-summary").startswith(f"{n_all} of"), p.inner_text("#rec-summary"))
            p.click("#my-role")
            check("กดป้ายบทบาท ขึ้นเมนู 3 บทบาท ติ๊กที่ Admin", p.eval_on_selector_all("#role-menu button", "bs => bs.map(b => b.innerText.trim() + (b.getAttribute('aria-checked') === 'true' ? '*' : ''))") == ["Member", "Manager", "Admin*"])
            p.screenshot(path=str(EVID / "11_role_menu.png"))
            p.keyboard.press("Escape")
            view("MEMBER")
            check("ดูแบบ Member เห็นเฉพาะแถวของตัวเอง ไม่มีแท็บ Settings", p.inner_text("#my-role") == "Member" and p.inner_text("#rec-summary").startswith(f"{n_65} of")
                  and n_65 < n_all and not p.is_visible("#tab-settings"), f"{p.inner_text('#rec-summary')} / ของ 65 {n_65} ทั้งหมด {n_all}")
            p.click("#rec-table tbody tr[data-id]")
            check("ดูแบบ Member ไม่มีปุ่มลบแถว", not p.query_selector("#btn-del-one"))
            p.screenshot(path=str(EVID / "12_view_as_member.png"))
            view("MANAGER")
            check("ดูแบบ Manager เห็นทุกแถว ไม่มีปุ่มลบ ไม่มีแท็บ Settings", p.inner_text("#rec-summary").startswith(f"{n_all} of") and not p.query_selector("#btn-del-one")
                  and not p.is_visible("#tab-settings"), p.inner_text("#rec-summary"))
            p.click("#tab-import"); view("ADMIN")
            check("กลับเป็น Admin แท็บ Settings กลับมา", p.is_visible("#tab-settings") and p.inner_text("#my-role") == "Admin")
            p.click("#tab-settings"); view("MEMBER")
            check("อยู่หน้า Settings แล้วสลับเป็น Member เด้งไปหน้าตาราง", p.query_selector("#rec-table") is not None and not p.query_selector("#settings"))
            check("สลับบทบาทไม่มี error ในคอนโซล", not p.errors, "; ".join(p.errors[:3]))
            ctx.close()

            # จอเตี้ย (แอปอยู่ในกรอบ MDA บนโน้ตบุ๊ก) รายการในกล่องตัวกรองต้องไม่หดเหลือ 2 แถว (พี่ปอนด์ 29/10 รอบ 4 ภาพ #54)
            ctx, p = open_page(b, srv, vp=(1366, 600))
            xf_list_check(p)
            date_tree_fit_check(p)
            xf_tall_check(p, "name")
            ctx.close()
            ctx, p = open_page(b, srv, vp=(1366, 900))
            xf_tall_check(p, "name")
            ctx.close()

            # ---------- มือถือ ----------
            ctx, p = open_page(b, srv, caller=u64, vp=(390, 844))
            p.screenshot(path=str(EVID / "08_member_mobile.png"))
            check("มือถือไม่ล้นจอแนวนอน", p.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
            ctx.close()
            b.close()
    finally:
        srv.proc.terminate()
    bad = [n for n, ok in RESULTS if not ok]
    print(f"\nรวม {len(RESULTS)} ข้อ ผ่าน {len(RESULTS) - len(bad)} ตก {len(bad)}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
