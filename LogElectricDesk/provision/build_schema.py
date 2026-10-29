"""สร้างตาราง le_* ใน env Log Electric Desk ตาม schema_spec.py (idempotent: มีแล้วข้าม) ใช้: python3 build_schema.py [ชื่อตาราง ...]"""
import sys, json
from lelib import *
from schema_spec import *

T = "Microsoft.Dynamics.CRM."
NOREQ = {"Value": "None", "CanBeChanged": True, "ManagedPropertyLogicalName": "canmodifyrequirementlevelsettings"}


def attr_json(c, secured_set):
    l, k, d, desc, o = c
    base = {"SchemaName": l, "DisplayName": lab(d), "Description": lab(desc) if desc else lab(d), "RequiredLevel": NOREQ}
    if l in secured_set:
        base["IsSecured"] = True
    if k == "txt":
        return {"@odata.type": T + "StringAttributeMetadata", "MaxLength": o["n"], "FormatName": {"Value": "Text"}, **base}
    if k == "auto":
        return {"@odata.type": T + "StringAttributeMetadata", "MaxLength": 100, "FormatName": {"Value": "Text"},
                "AutoNumberFormat": o["fmt"], **base}
    if k == "memo":
        return {"@odata.type": T + "MemoAttributeMetadata", "MaxLength": o["n"], "Format": "TextArea", **base}
    if k == "int":
        return {"@odata.type": T + "IntegerAttributeMetadata", "MinValue": o["min"], "MaxValue": o["max"], "Format": "None", **base}
    if k == "dec":
        return {"@odata.type": T + "DecimalAttributeMetadata", "Precision": o.get("prec", 2),
                "MinValue": o.get("min", -100000000000.0), "MaxValue": o.get("max", 100000000000.0), **base}
    if k == "date":
        return {"@odata.type": T + "DateTimeAttributeMetadata", "Format": "DateOnly", "DateTimeBehavior": {"Value": "DateOnly"}, **base}
    if k == "dt":
        return {"@odata.type": T + "DateTimeAttributeMetadata", "Format": "DateAndTime", "DateTimeBehavior": {"Value": "UserLocal"}, **base}
    if k == "bool":
        return {"@odata.type": T + "BooleanAttributeMetadata", "DefaultValue": o.get("default", False),
                "OptionSet": {"TrueOption": {"Value": 1, "Label": lab("Yes")}, "FalseOption": {"Value": 0, "Label": lab("No")}}, **base}
    if k == "choice":
        js = {"@odata.type": T + "PicklistAttributeMetadata",
              "OptionSet": {"@odata.type": T + "OptionSetMetadata", "OptionSetType": "Picklist", "IsGlobal": False,
                            "Options": [{"Value": v, "Label": lab(t)} for t, v in o["opts"]]}, **base}
        if "default" in o:
            js["DefaultFormValue"] = o["default"]
        return js
    raise ValueError(k)


def exists(url):
    s, j, _ = req("GET", url)
    return s == 200


def create_entity(name, spec):
    if exists(f"EntityDefinitions(LogicalName='{name}')?$select=LogicalName"):
        print("entity exists", name)
        return
    pn, pd, pl, pdesc = spec["primary"]
    body = {"@odata.type": T + "EntityMetadata", "SchemaName": name, "DisplayName": lab(spec["display"]),
            "DisplayCollectionName": lab(spec["plural"]), "Description": lab(spec["display"]),
            "OwnershipType": "UserOwned", "IsAuditEnabled": {"Value": spec.get("audit", False), "CanBeChanged": True, "ManagedPropertyLogicalName": "canmodifyauditsettings"}, "HasNotes": False, "HasActivities": False,
            "Attributes": [{"@odata.type": T + "StringAttributeMetadata", "SchemaName": pn, "DisplayName": lab(pd),
                            "Description": lab(pdesc or pd), "IsPrimaryName": True, "MaxLength": pl,
                            "RequiredLevel": {"Value": "ApplicationRequired"}, "FormatName": {"Value": "Text"}}]}
    s, j, h = req("POST", "EntityDefinitions", body, sol_hdr())
    print("create entity", name, s, "" if s < 300 else json.dumps(j)[:400])
    if s >= 300:
        raise SystemExit(1)


def create_cols(name, spec):
    secured = set(spec.get("secured", []))
    for c in spec["cols"]:
        l, k = c[0], c[1]
        if exists(f"EntityDefinitions(LogicalName='{name}')/Attributes(LogicalName='{l}')?$select=LogicalName"):
            continue
        if k == "lookup":
            continue
        s, j, _ = req("POST", f"EntityDefinitions(LogicalName='{name}')/Attributes", attr_json(c, secured), sol_hdr())
        print("  col", name, l, s, "" if s < 300 else json.dumps(j)[:500])
        if s >= 300:
            raise SystemExit(1)


def create_lookups(name, spec):
    for l, k, d, desc, o in spec["cols"]:
        if k != "lookup":
            continue
        if exists(f"EntityDefinitions(LogicalName='{name}')/Attributes(LogicalName='{l}')?$select=LogicalName"):
            continue
        rel = f"{name}_{l}"
        body = {"@odata.type": T + "OneToManyRelationshipMetadata", "SchemaName": rel,
                "ReferencedEntity": o["target"], "ReferencingEntity": name,
                "AssociatedMenuConfiguration": {"Behavior": "UseLabel", "Group": "Details", "Label": lab(spec["display"]), "Order": 10000},
                "CascadeConfiguration": {"Assign": "NoCascade", "Delete": o.get("cascade", "RemoveLink"), "Merge": "NoCascade", "Reparent": "NoCascade",
                                        "Share": "NoCascade", "Unshare": "NoCascade", "RollupView": "NoCascade"},
                "Lookup": {"@odata.type": T + "LookupAttributeMetadata", "SchemaName": l, "DisplayName": lab(d),
                           "Description": lab(desc or d), "RequiredLevel": NOREQ}}
        if l in set(spec.get("secured", [])):
            body["Lookup"]["IsSecured"] = True
        s, j, _ = req("POST", "RelationshipDefinitions", body, sol_hdr())
        print("  lookup", name, l, "->", o["target"], s, "" if s < 300 else json.dumps(j)[:500])
        if s >= 300:
            raise SystemExit(1)


if __name__ == "__main__":
    only = sys.argv[1:] or ORDER
    for n in ORDER:
        if n in only:
            create_entity(n, TABLES[n])
    for n in ORDER:
        if n in only:
            create_cols(n, TABLES[n])
    for n in ORDER:
        if n in only:
            create_lookups(n, TABLES[n])
