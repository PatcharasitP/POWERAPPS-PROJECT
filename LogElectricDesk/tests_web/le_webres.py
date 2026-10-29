#!/usr/bin/env python3
"""le_webres.py  เปิดหน้าเว็บที่อัปขึ้น env pvdesk จริง (/WebResources/le_/desk/web/index.html) ด้วย token ของ 65 เป็น header
ตรวจว่าโมดูลโหลดจาก Dataverse ได้ทุกไฟล์ ต่อ Dataverse ได้เอง ตัวอ่าน Excel (vendor) โหลดได้ ส่งออกและเทมเพลตทำงาน
ใช้: PVDESK_TOKEN=$(az account get-access-token --resource https://pvdesk.crm5.dynamics.com --query accessToken -o tsv) .venv/bin/python Log_Electric/desk/tests_web/le_webres.py"""
import os, pathlib, sys, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from le_ui import check, RESULTS, EVID, count, FILES  # noqa: E402

BASE = "https://pvdesk.crm5.dynamics.com"
TOKEN = os.environ.get("PVDESK_TOKEN", "")
with sync_playwright() as pw:
    b = pw.chromium.launch()
    ctx = b.new_context(viewport={"width": 1366, "height": 800}, accept_downloads=True, extra_http_headers={"Authorization": f"Bearer {TOKEN}"})
    p = ctx.new_page()
    errs, bad = [], []
    p.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    p.on("pageerror", lambda e: errs.append(str(e)))
    p.on("response", lambda r: bad.append(f"{r.status} {r.url[len(BASE):][:80]}") if r.status >= 400 else None)
    p.goto(f"{BASE}/WebResources/le_/desk/web/index.html")
    p.wait_for_selector("body.app-ready, .boot-err", timeout=60000)
    check("หน้าเว็บบน Dataverse เปิดได้ เป็น Admin", "Admin" in p.inner_text("#my-role"))
    n = count()
    check("เห็นทุกแถวเท่าที่ Dataverse มี", p.inner_text("#rec-summary").startswith(f"{n} of {n} rows"), f"{p.inner_text('#rec-summary')} / {n}")
    p.click("#tab-import")
    with p.expect_download() as d:
        p.click("#btn-template")
    check("ดาวน์โหลดเทมเพลตจากหน้าบน Dataverse ได้", d.value.suggested_filename == "LOG_ELECTRIC_TEMPLATE.xlsx")
    with p.expect_download() as d:
        p.set_input_files("#imp-file", str(FILES / "bad.xlsx"))
    check("ตัวอ่าน Excel (vendor) โหลดจาก Dataverse ได้ ไฟล์ error ออก", d.value.suggested_filename == "bad_errors.xlsx")
    p.click("#tab-records")
    p.click("#btn-export")
    with p.expect_download() as d:
        p.click("#export-go")
    check("ส่งออก XLSX จากหน้าบน Dataverse ได้", d.value.suggested_filename.endswith(".xlsx"))
    p.screenshot(path=str(EVID / "09_webres_live.png"))
    check("ไม่มีคำขอที่ล้ม", not bad, "; ".join(bad[:4]))
    check("ไม่มี error ในคอนโซล", not errs, "; ".join(errs[:3]))
    b.close()
bad_ = [n for n, ok in RESULTS if not ok]
print(f"รวม {len(RESULTS)} ข้อ ผ่าน {len(RESULTS) - len(bad_)} ตก {len(bad_)}")
sys.exit(1 if bad_ else 0)
