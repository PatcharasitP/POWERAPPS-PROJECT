# POWERAPPS-PROJECT

## LogElectricDesk
แอป model-driven บน Dataverse สำหรับบันทึก LOG ELECTRIC ตามเทมเพลต รุ่นล่าสุด 1.0.0.11 (30/10/2026)

- ติดตั้ง: `LogElectricDesk/deploy/LogElectricDesk_1_0_0_11_managed.zip` ทำตาม `LogElectricDesk/deploy/คู่มือติดตั้งที่ทรู.md`
- หน้าเว็บของแอป: `LogElectricDesk/web/` (ES modules ไม่มีขั้น build)
- สร้างตาราง บทบาท และออกซิป: `LogElectricDesk/provision/`
- เทส: `LogElectricDesk/tests/` (node --test) กับ `LogElectricDesk/tests_web/` (Playwright บน env ทดสอบ)
