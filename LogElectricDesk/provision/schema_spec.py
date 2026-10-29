"""สเปกตาราง Log Electric Desk ตามชีต WEBAPP-LOG ELECTRIC ในไฟล์ WEBAPP-LOG ELECTRIC.xlsx (29/10/2026)
ตาราง le_logelectric คือตารางเดียวที่ Power BI ดึง ส่วน le_history เก็บประวัติการแก้ต่อแถว"""

# column = (logical, kind, display, description, opts)
# kind: txt dec date memo auto choice lookup
def C(l, k, d, desc="", **o):
    return (l, k, d, desc, o)

LOG_COLS = [
    C("le_index", "auto", "INDEX", "ระบบออกเลขเอง 1 2 3 ไม่ซ้ำ", fmt="{SEQNUM:1}"),
    C("le_logbookdate", "date", "LOG BOOK DATE"),
    C("le_sitecode", "txt", "SITE CODE CANDIDATE", n=100),
    C("le_sitecodenocand", "txt", "SITE CODE NO CANDIDATE", "ระบบตัด suffix จาก SITE CODE CANDIDATE", n=100),
    C("le_name", "txt", "NAME", n=200),
    C("le_duedate", "date", "DUE DATE"),
    C("le_amount", "dec", "AMOUNT", prec=2),
    C("le_paymentmethod", "txt", "PAYMENT METHOD", n=40),
    C("le_accountant", "txt", "ACCOUNTANT", n=100),
    C("le_requestor", "txt", "REQUESTOR", n=100),
    C("le_team", "txt", "TEAM", n=40),
    C("le_system", "txt", "SYSTEM", n=40),
    C("le_companycode", "txt", "COMPANY CODE", n=10),
    C("le_companyname", "txt", "COMPANY NAME", "ระบบเติมจาก COMPANY CODE", n=200),
    C("le_remark", "txt", "REMARK", n=1000),
    C("le_source", "txt", "SOURCE", "Manual หรือชื่อไฟล์ที่นำเข้า", n=200),
]

ACTIONS = [("Create", 1), ("Update", 2), ("Import", 3)]

TABLES = {
    "le_logelectric": dict(display="Log Electric", plural="Log Electric", primary=("le_pronumber", "PRO NUMBER", 100, ""),
                           cols=LOG_COLS, audit=True),
    "le_history": dict(display="Log Electric History", plural="Log Electric History", primary=("le_name", "Summary", 200, ""), cols=[
        C("le_record", "lookup", "Record", target="le_logelectric", cascade="Cascade"),
        C("le_recordindex", "txt", "Record INDEX", "เลข INDEX ของแถวตอนแก้", n=20),
        C("le_action", "choice", "Action", opts=ACTIONS),
        C("le_changes", "memo", "Changes", "JSON รายการ [ช่อง, ค่าเดิม, ค่าใหม่]", n=20000),
    ]),
}
ORDER = ["le_logelectric", "le_history"]
