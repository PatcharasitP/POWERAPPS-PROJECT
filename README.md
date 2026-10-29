# POWERAPPS-PROJECT

## LogElectricDesk รุ่น 1.0.0.11 (30/10/2026)
แอป model-driven บน Dataverse สำหรับบันทึก LOG ELECTRIC ตามเทมเพลต

### ติดตั้งที่ทรู = Import managed solution (.zip)
ใช้ไฟล์เดียว: [`LogElectricDesk/deploy/LogElectricDesk_1_0_0_11_managed.zip`](LogElectricDesk/deploy/LogElectricDesk_1_0_0_11_managed.zip) (กดเข้าไปแล้วกดปุ่มดาวน์โหลด)

1. เปิด https://make.powerapps.com เลือก env Production ที่มุมขวาบน
2. เมนูซ้าย **Solutions** แล้วกด **Import solution**
3. กด **Browse** เลือกไฟล์ `LogElectricDesk_1_0_0_11_managed.zip` กด **Next** แล้ว **Import**
4. รอจนขึ้นแถบเขียว Successfully imported แล้วทำขั้นต่อไปตาม [คู่มือติดตั้งที่ทรู](LogElectricDesk/deploy/คู่มือติดตั้งที่ทรู.md) (ตั้งลิงก์แอป , ใส่บทบาท , เปิดครั้งแรกด้วย LE Admin)

ติดตั้งแล้วได้ตารางเปล่า ไม่มีข้อมูลติดไป

### โฟลเดอร์อื่น (ไม่ต้องใช้ตอนติดตั้ง)
- `LogElectricDesk/unmanaged/` ซิป unmanaged ไว้แก้ต่อใน env ทดสอบ ห้ามเอาไป import ที่ทรู
- `LogElectricDesk/web/` โค้ดหน้าเว็บของแอป (ES modules ไม่มีขั้น build)
- `LogElectricDesk/provision/` กับ `LogElectricDesk/tools/` สคริปต์สร้างตาราง บทบาท และออกซิป
- `LogElectricDesk/tests/` (node --test) กับ `LogElectricDesk/tests_web/` (Playwright บน env ทดสอบ)
