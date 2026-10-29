"""ExportSolution ผ่าน Web API: ตั้งเลขรุ่นใหม่ก่อน แล้วเขียนซิป managed (ส่งทรู) กับ unmanaged (สำรอง) ลง deploy/
ใช้: python3 export_solution.py 1.0.0.1"""
import base64, hashlib, sys
from pathlib import Path
from lelib import *
ver = sys.argv[1]
s, j, _ = req("GET", f"solutions?$select=solutionid&$filter=uniquename eq '{SOL}'")
print("set version", req("PATCH", f"solutions({j['value'][0]['solutionid']})", {"version": ver})[0])
req("POST", "PublishAllXml")
out = Path(__file__).resolve().parent.parent / "deploy"
out.mkdir(exist_ok=True)
for managed in (True, False):
    s, j, _ = req("POST", "ExportSolution", {"SolutionName": SOL, "Managed": managed})
    if s >= 300:
        raise SystemExit(f"export {managed} {s} {j}")
    data = base64.b64decode(j["ExportSolutionFile"])
    p = out / f"{SOL}_{ver.replace('.', '_')}{'_managed' if managed else ''}.zip"
    p.write_bytes(data)
    print(p.name, len(data), hashlib.sha256(data).hexdigest()[:16])
