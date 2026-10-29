"""สร้าง publisher le กับ solution LogElectricDesk ใน env dev (มีแล้วข้าม)"""
from lelib import *

s, j, _ = req("GET", "publishers?$select=publisherid&$filter=uniquename eq 'LogElectric'")
if j["value"]:
    pid = j["value"][0]["publisherid"]
else:
    s, j, h = req("POST", "publishers", {"uniquename": "LogElectric", "friendlyname": "Log Electric",
                                          "customizationprefix": "le", "customizationoptionvalueprefix": 53901})
    print("publisher", s, j)
    pid = h["OData-EntityId"].split("(")[1].rstrip(")")
s, j, _ = req("GET", f"solutions?$select=solutionid&$filter=uniquename eq '{SOL}'")
if not j["value"]:
    s, j, h = req("POST", "solutions", {"uniquename": SOL, "friendlyname": "Log Electric Desk", "version": "1.0.0.0",
                                         "publisherid@odata.bind": f"/publishers({pid})"})
    print("solution", s, j)
print("publisher", pid, "solution ok")
