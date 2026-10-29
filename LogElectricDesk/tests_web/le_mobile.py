#!/usr/bin/env python3
"""le_mobile.py  ใช้ Log Electric Desk บนมือถือและแท็บเล็ตหลายรุ่น ทั้งแนวตั้งและแนวนอน (พี่ปอนด์ 30/10/2026 "ลองกับหลาย ๆ รุ่นด้วยหลาย ๆ มุม")

iPhone กับ iPad เปิดด้วย WebKit (เครื่องยนต์เดียวกับ Safari) รุ่น Android เปิดด้วย Chromium ใช้ค่าจำลองรุ่นของ Playwright (ขนาดจอ , ความคมจอ , สัมผัส , user agent)
ทุกรุ่นเดินเส้นทางเดียวกัน: เปิดแอป , แถบบน , แถบเครื่องมือ , เห็นตารางกี่แถว , กล่องตัวกรอง , แตะแถวดูรายละเอียด , ฟอร์มเพิ่มแถว , นำเข้าไฟล์ , ส่งออก , เมนูบทบาท
อ่านอย่างเดียว ไม่บันทึกอะไรลง Dataverse (นำเข้าแค่ตรวจไฟล์ ไม่กด Import)
ใช้: PVDESK_TOKEN=$(az account get-access-token --resource https://pvdesk.crm5.dynamics.com --query accessToken -o tsv) .venv/bin/python Log_Electric/desk/tests_web/le_mobile.py [ชื่อรุ่น ...]
"""
import pathlib, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from le_ui import check, RESULTS, EVID, FILES, Server, open_page  # noqa: E402

OUT = EVID / "mobile"; OUT.mkdir(parents=True, exist_ok=True)
DEVICES = sys.argv[1:] or [
    "iPhone SE", "iPhone SE landscape",                    # จอเล็กสุด 320 กว้าง
    "iPhone 15 Pro Max", "iPhone 15 Pro Max landscape",
    "iPhone 14", "iPhone 14 landscape",
    "Galaxy S8", "Galaxy S8 landscape",                    # Android จอแคบ 360
    "Galaxy S24", "Galaxy S24 landscape",
    "Pixel 7", "Pixel 7 landscape",
    "iPad Mini", "iPad Mini landscape",
    "Galaxy Tab S9", "Galaxy Tab S9 landscape",
]

# ช่องพิมพ์ต่ำกว่า 16px บน iPhone แตะแล้ว Safari ซูมหน้าเองทั้งหน้า ต้องถ่างนิ้วออกทุกครั้ง
SMALL_INPUTS = """() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea')]
  .filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => (e.id || e.className || e.tagName) + ' ' + getComputedStyle(e).fontSize)"""

# ปุ่มที่นิ้วต้องแตะ ต่ำกว่า 32px แตะพลาดง่าย (แนวทาง Apple 44 , Material 48 ใช้ 32 เป็นเส้นต่ำสุดที่ยอมได้ในตารางข้อมูล)
SMALL_TAPS = """(sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent).map((e) => { const b = e.getBoundingClientRect();
  return [e.id || e.className, Math.round(b.width), Math.round(b.height)]; }).filter((x) => x[1] < 32 || x[2] < 32).slice(0, 5)"""

INSIDE = """(sel) => { const e = document.querySelector(sel); if (!e) return 'missing ' + sel; const b = e.getBoundingClientRect();
  return b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1 ? true : sel + ' ' + [b.left, b.top, b.right, b.bottom].map(Math.round) + ' vw ' + innerWidth + ' vh ' + innerHeight; }"""

# เลื่อนหน้าให้หัวตารางชิดใต้แถบบน แล้วนับแถวข้อมูลที่เห็นครบทั้งแถว (แนวนอนเดิมเห็นแถวเดียวครึ่ง)
ROWS_SEEN = """() => { const w = document.querySelector('.table-wrap'), bar = document.querySelector('.appbar').getBoundingClientRect().bottom;
  scrollTo(0, scrollY + w.getBoundingClientRect().top - bar);
  const top = Math.max(bar, w.getBoundingClientRect().top), bot = Math.min(innerHeight, w.getBoundingClientRect().bottom);
  return [...w.querySelectorAll('tbody tr[data-id]')].filter((r) => { const b = r.getBoundingClientRect(); return b.top >= top - 1 && b.bottom <= bot + 1; }).length; }"""


def tag(name):
    return name.replace(" ", "_").replace("(", "").replace(")", "")


def run_device(pw, srv, name):
    dev = pw.devices[name]
    b = getattr(pw, dev["default_browser_type"]).launch()
    ctx, p = open_page(b, srv, device=dev)
    t, w, hgt = tag(name), dev["viewport"]["width"], dev["viewport"]["height"]
    phone = w < 640
    pre = f"[{name} {w}x{hgt}]"
    try:
        p.wait_for_timeout(600)
        check(f"{pre} เปิดแอปได้ ไม่ล้นจอแนวนอน", p.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"),
              str(p.evaluate("[document.documentElement.scrollWidth, innerWidth]")))
        bad = [r for r in (p.evaluate(INSIDE, s) for s in ("#my-role", "#tab-records", "#tab-import", "#rec-search", "#btn-add", "#btn-export", "#btn-refresh")) if r is not True]
        check(f"{pre} แถบบนและปุ่มหลักอยู่ในจอครบ", not bad, "; ".join(bad))
        # วัดจากขอบบนแถบถึงขอบล่างปุ่มล่างสุด (ความสูงกล่องรวมขอบล่างของแถวสุดท้ายที่หักคืนด้วย margin ติดลบ ไม่ใช่ที่กินจอจริง)
        tb = p.evaluate("""() => { const t = document.querySelector('.toolbar'); const top = t.getBoundingClientRect().top;
          return Math.round(Math.max(...[...t.children].filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().bottom)) - top); }""")
        if phone:
            check(f"{pre} แถบเครื่องมือไม่กินจอ (สูงไม่เกิน 140px ราว 3 แถว)", tb <= 140, f"{tb}px")
        seen = p.evaluate(ROWS_SEEN)
        check(f"{pre} เลื่อนลงมาที่ตารางแล้วเห็นข้อมูลอย่างน้อย 4 แถวพร้อมกัน", seen >= 4, f"{seen} แถว")
        p.evaluate("scrollTo(0, 0)")
        p.screenshot(path=str(OUT / f"{t}_1_records.png"))
        small = p.evaluate(SMALL_INPUTS)
        check(f"{pre} ช่องพิมพ์ในหน้าตาราง 16px ขึ้นไป (iPhone ไม่ซูมเองตอนแตะ)", not small, ", ".join(small[:4]))
        taps = p.evaluate(SMALL_TAPS, "#my-role, .tab, .toolbar button, .xf-btn, #rec-xf-mobile")
        check(f"{pre} ปุ่มที่ต้องแตะใหญ่พอ อย่างน้อย 32px", not taps, str(taps))

        # กล่องตัวกรอง: มือถือแนวตั้งเข้าทางปุ่ม Column filters ที่เหลือแตะกรวยที่หัวคอลัมน์
        if p.is_visible("#rec-xf-mobile"):
            p.tap("#rec-xf-mobile"); p.tap('.xf-col[data-col="name"]')
        else:
            p.tap('.xf-btn[data-col="name"]')
        p.wait_for_selector(".xf-pop:not([hidden]) .xf-list .xf-item", timeout=10000)
        p.wait_for_timeout(300)
        r1, r2 = p.evaluate(INSIDE, ".xf-pop"), p.evaluate(INSIDE, ".xf-pop .xf-foot .btn.dark, .xf-pop .xf-foot button:last-child")
        check(f"{pre} กล่องตัวกรองอยู่ในจอ ปุ่ม OK เห็นครบ", r1 is True and r2 is True, f"{r1} / {r2}")
        # แนวนอนเดิมเห็นแค่เมนูกับช่อง Search ค่าให้ติ๊กซ่อนอยู่ใต้ปุ่ม OK ในกล่องเลื่อนซ้อนกล่องเลื่อน (เห็นจากภาพ 30/10)
        vals = p.evaluate("""() => { const pop = document.querySelector('.xf-pop').getBoundingClientRect(), foot = document.querySelector('.xf-pop .xf-foot').getBoundingClientRect();
          const items = [...document.querySelectorAll('.xf-pop .xf-list .xf-item')];
          const seen = items.filter((e) => { const b = e.getBoundingClientRect(); return b.top >= pop.top - 1 && b.bottom <= Math.min(foot.top, innerHeight) + 1; }).length;
          return [seen, items.length]; }""")
        check(f"{pre} เปิดกล่องตัวกรองแล้วเห็นค่าให้ติ๊กทันทีอย่างน้อย 3 ค่า", vals[0] >= min(3, vals[1]), f"เห็น {vals[0]} จาก {vals[1]}")
        focus = p.evaluate("document.activeElement.className")
        check(f"{pre} จอสัมผัสเปิดกล่องตัวกรองแล้วคีย์บอร์ดไม่เด้งขึ้นเอง (ช่อง Search ไม่ถูกโฟกัส)", "xf-search" not in focus, focus)
        p.screenshot(path=str(OUT / f"{t}_2_filter.png"))
        p.keyboard.press("Escape"); p.wait_for_timeout(200)
        if p.is_visible(".xf-pop"):
            p.mouse.click(2, hgt - 2)

        # แตะแถวแรก แผงรายละเอียดขึ้น ปุ่ม Edit กดได้
        p.tap("#rec-table tbody tr[data-id]")
        p.wait_for_selector("#btn-edit", state="visible", timeout=10000)
        p.wait_for_timeout(350)
        r = p.evaluate(INSIDE, "#btn-edit")
        check(f"{pre} แตะแถวแล้วแผงรายละเอียดขึ้น ปุ่ม Edit อยู่ในจอ", r is True, str(r))
        p.screenshot(path=str(OUT / f"{t}_3_detail.png"))
        p.tap("#btn-edit"); p.wait_for_selector("#rec-form", timeout=10000); p.wait_for_timeout(350)
        r = p.evaluate(INSIDE, "#btn-save")
        small = p.evaluate(SMALL_INPUTS)
        check(f"{pre} ฟอร์มแก้แถว ปุ่ม Save อยู่ในจอ และช่องกรอก 16px ขึ้นไป", r is True and not small, f"{r} {', '.join(small[:4])}")
        p.tap("#f-name")
        p.wait_for_timeout(300)
        r = p.evaluate(INSIDE, "#f-name")
        check(f"{pre} แตะช่อง NAME แล้วช่องอยู่ในจอให้เห็นตอนพิมพ์", r is True and p.evaluate("document.activeElement.id") == "f-name", str(r))
        p.screenshot(path=str(OUT / f"{t}_4_form.png"))
        p.keyboard.press("Escape"); p.wait_for_timeout(250)
        p.evaluate("document.querySelector('.side-panel.open .sp-foot .btn:not(.primary)')?.click()")
        p.wait_for_timeout(250)
        p.evaluate("document.querySelector('.side-panel.open [aria-label=Close]')?.click()")
        p.wait_for_timeout(300)

        # นำเข้า: ตรวจไฟล์ผ่าน ปุ่ม Import อยู่ในหน้า (เลื่อนถึง) และการ์ดไม่ล้นจอ ไม่กดนำเข้าจริง
        p.tap("#tab-import")
        p.set_input_files("#imp-file", str(FILES / "good.xlsx"))
        p.wait_for_selector("#imp-ready, #imp-alldup", timeout=30000)
        p.locator("#btn-confirm-import").scroll_into_view_if_needed()
        p.wait_for_timeout(200)
        r = p.evaluate(INSIDE, "#btn-confirm-import")
        over = p.evaluate("document.documentElement.scrollWidth - innerWidth")
        check(f"{pre} นำเข้าไฟล์ผ่าน ปุ่ม Import เลื่อนถึงได้ หน้าไม่ล้นแนวนอน", r is True and over <= 1, f"{r} ล้น {over}px")
        p.screenshot(path=str(OUT / f"{t}_5_import.png"))

        # ส่งออก: หน้าต่างอยู่ในจอ ปุ่มส่งออกเห็นหรือเลื่อนถึงในหน้าต่าง
        p.tap("#tab-records"); p.wait_for_selector("#btn-export", state="visible")
        p.tap("#btn-export"); p.wait_for_selector("dialog.dlg[open] #export-go", timeout=10000); p.wait_for_timeout(250)
        p.locator("#export-go").scroll_into_view_if_needed()
        r1, r2 = p.evaluate(INSIDE, "dialog.dlg[open]"), p.evaluate(INSIDE, "#export-go")
        check(f"{pre} หน้าต่างส่งออกอยู่ในจอ ปุ่มส่งออกกดได้", r1 is True and r2 is True, f"{r1} / {r2}")
        p.screenshot(path=str(OUT / f"{t}_6_export.png"))
        p.keyboard.press("Escape"); p.wait_for_timeout(200)

        # เมนูบทบาท: อยู่ในจอ สลับเป็น Member แล้วยังใช้ได้
        p.tap("#my-role"); p.wait_for_selector("#role-menu", state="visible")
        r = p.evaluate(INSIDE, "#role-menu")
        p.tap('#role-menu [data-role="MEMBER"]'); p.wait_for_timeout(400)
        ok = p.inner_text("#my-role").startswith("Member") and not p.is_visible("#rec-owner")
        over = p.evaluate("document.documentElement.scrollWidth - innerWidth")
        check(f"{pre} เมนูบทบาทอยู่ในจอ สลับเป็น Member ได้ ช่องเลือกคนหาย ไม่ล้นจอ", r is True and ok and over <= 1, f"{r} {p.inner_text('#my-role')} ล้น {over}")
        p.screenshot(path=str(OUT / f"{t}_7_member.png"))
        check(f"{pre} ไม่มี error ในคอนโซล", not p.errors, "; ".join(p.errors[:3]))
    except Exception as e:
        msg = str(e)
        check(f"{pre} เดินครบเส้นทางไม่สะดุด", False, f"{type(e).__name__}: {msg.splitlines()[0][:160]}")
        p.screenshot(path=str(OUT / f"{t}_x_fail.png"))
    finally:
        ctx.close(); b.close()


def main():
    srv = Server()
    try:
        with sync_playwright() as pw:
            for name in DEVICES:
                run_device(pw, srv, name)
    finally:
        srv.proc.terminate()
    bad = [n for n, ok in RESULTS if not ok]
    print(f"\nรวม {len(RESULTS)} ข้อ ผ่าน {len(RESULTS) - len(bad)} ตก {len(bad)}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
