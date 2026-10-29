"""helper สำหรับ Dataverse Web API ของ env Log Electric Desk (dev อยู่ env pvdesk) (token มาจาก az ตอนรัน ไม่เก็บลงไฟล์)"""
import json, subprocess, time, urllib.request, urllib.error, urllib.parse

ORG = "https://pvdesk.crm5.dynamics.com"
API = ORG + "/api/data/v9.2/"
SOL = "LogElectricDesk"
_tok = {"v": None, "t": 0}


def token():
    if time.time() - _tok["t"] > 1800:
        _tok["v"] = subprocess.check_output(
            ["az", "account", "get-access-token", "--resource", ORG, "--query", "accessToken", "-o", "tsv"],
            text=True).strip()
        _tok["t"] = time.time()
    return _tok["v"]


def req(method, path, body=None, headers=None, retries=3, raw=False):
    url = path if path.startswith("http") else API + path
    url = urllib.parse.quote(url, safe="/:?&=$,()'@%;+*!~#")
    h = {"Authorization": "Bearer " + token(), "Accept": "application/json",
         "OData-MaxVersion": "4.0", "OData-Version": "4.0"}
    if body is not None:
        h["Content-Type"] = "application/json; charset=utf-8"
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    for i in range(retries):
        r = urllib.request.Request(url, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(r, timeout=300) as resp:
                txt = resp.read().decode()
                hdr = dict(resp.headers)
                js = json.loads(txt) if txt.strip() and not raw else (txt if raw else None)
                return resp.status, js, hdr
        except urllib.error.HTTPError as e:
            txt = e.read().decode()
            try:
                js = json.loads(txt)
            except Exception:
                js = {"raw": txt}
            if e.code in (429, 503) and i < retries - 1:
                time.sleep(int(e.headers.get("Retry-After", "10")))
                continue
            return e.code, js, dict(e.headers)


def lab(text, lang=1033):
    return {"@odata.type": "Microsoft.Dynamics.CRM.Label",
            "LocalizedLabels": [{"@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel", "Label": text, "LanguageCode": lang}]}


def sol_hdr():
    return {"MSCRM.SolutionUniqueName": SOL}
