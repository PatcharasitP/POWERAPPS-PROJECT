"""สร้าง security role 3 ตัวใน solution LogElectricDesk ตามตารางสิทธิ์ใน SCHEMA.md (idempotent: role มีแล้วจะตั้งสิทธิ์ซ้ำ)"""
import json, re, sys
from lelib import *

BU = "4cd28ce0-e4c9-f111-a05c-00224816cd1e"
BASIC_USER = "a0d68ce0-e4c9-f111-a05c-00224816cd1e"
ALL = ["Create", "Read", "Write", "Delete", "Assign", "Append", "AppendTo"]

# (table -> {สิทธิ์: depth}) Basic = แถวของตัวเอง, Global = ทุกแถว
# Member เห็นและแก้แถวตัวเอง ลบไม่ได้ / Manager อ่านแก้ทุกแถว ลบไม่ได้ / Admin ทำได้ทุกอย่างรวมลบทั้งหมด (PLAN.md ข้อตัดสิน 2)
MEMBER = {
    "le_logelectric": {"Create": "Basic", "Read": "Basic", "Write": "Basic", "Append": "Basic", "AppendTo": "Basic"},
    "le_history": {"Create": "Basic", "Read": "Basic", "Append": "Basic"},
}
def full(*rights): return {r: "Global" for r in rights}
MANAGER = {
    "le_logelectric": full("Create", "Read", "Write", "Assign", "Append", "AppendTo"),
    "le_history": full("Create", "Read", "Assign", "Append"),
}
ADMIN = {"le_logelectric": full(*ALL), "le_history": full(*ALL)}
ROLES = {"LE Member": MEMBER, "LE Manager": MANAGER, "LE Admin": ADMIN}


def priv_id(name):
    s, j, _ = req("GET", f"privileges?$select=privilegeid,name&$filter=name eq '{name}'")
    if not j["value"]:
        raise SystemExit("no privilege " + name)
    return j["value"][0]["privilegeid"]


def base_privs():
    s, j, _ = req("GET", f"RetrieveRolePrivilegesRole(RoleId={BASIC_USER})")
    out = []
    for p in j["RolePrivileges"]:
        n = p["PrivilegeName"]
        if n.startswith("prvRead") or re.match(r"^prv(Create|Write|Delete)User", n):
            out.append({"Depth": p["Depth"], "PrivilegeId": p["PrivilegeId"], "BusinessUnitId": BU})
    return out


def ensure_role(name):
    s, j, _ = req("GET", f"roles?$select=roleid&$filter=name eq '{name}'")
    if j["value"]:
        return j["value"][0]["roleid"]
    s, j, h = req("POST", "roles", {"name": name, "businessunitid@odata.bind": f"/businessunits({BU})"}, sol_hdr())
    print("role", name, s, j)
    return h["OData-EntityId"].split("(")[1].rstrip(")")


if __name__ == "__main__":
    base = base_privs()
    print("base privileges", len(base))
    dump = {}
    for rname, spec in ROLES.items():
        rid = ensure_role(rname)
        privs = list(base)
        for tbl, rights in spec.items():
            ent = "User" if tbl == "systemuser" else tbl
            for r, depth in rights.items():
                privs.append({"Depth": depth, "PrivilegeId": priv_id(f"prv{r}{ent}"), "BusinessUnitId": BU})
        s, j, _ = req("POST", f"roles({rid})/Microsoft.Dynamics.CRM.AddPrivilegesRole", {"Privileges": privs})
        print(rname, rid, "add privs", len(privs), s, j if s >= 300 else "")
        s, j, _ = req("GET", f"RetrieveRolePrivilegesRole(RoleId={rid})")
        dump[rname] = {"roleid": rid, "privileges": [{"name": p["PrivilegeName"], "depth": p["Depth"]} for p in j["RolePrivileges"]]}
    json.dump(dump, open(sys.argv[1] if len(sys.argv) > 1 else "role_privileges.json", "w"), ensure_ascii=False, indent=1)
