#!/usr/bin/env python3
"""Strow POS report parser v1: EZI POS daily report (.xlsx) -> SQL for public.pos_import_report.
Input: the Gmail get_message RAW result saved as JSON, or the .xlsx itself. Python stdlib only.
Usage: python3 pos_report.py INPUT [OUT.sql]   (exit code 2 = report rejected, reason printed)
"""
import base64, email, email.policy, hashlib, io, json, re, sys, zipfile
import xml.etree.ElementTree as ET
from decimal import Decimal

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
P = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def fail(msg):
    print("REJECTED: " + msg, file=sys.stderr)
    sys.exit(2)


def load(path):
    data, msg_id = open(path, "rb").read(), None
    if data[:2] != b"PK":
        d = json.loads(data)
        msg_id, raw = d.get("id"), d["raw"]
        mime = email.message_from_bytes(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)), policy=email.policy.default)
        parts = [p for p in mime.walk() if not p.is_multipart() and (p.get_filename() or "").lower().endswith(".xlsx")]
        if not parts:
            fail("no .xlsx attachment in this email")
        data = parts[0].get_payload(decode=True)
    return data, msg_id


def ref(r):
    m = re.match(r"([A-Z]+)(\d+)$", r)
    c = 0
    for ch in m.group(1):
        c = c * 26 + ord(ch) - 64
    return int(m.group(2)), c


def workbook(xlsx):
    z = zipfile.ZipFile(io.BytesIO(xlsx))
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(M + "si"):
            ss.append("".join(t.text or "" for t in si.iter(M + "t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")).findall(P + "Relationship")}
    out = {}
    for s in ET.fromstring(z.read("xl/workbook.xml")).find(M + "sheets"):
        t = rels[s.get(R + "id")].lstrip("/")
        grid = {}
        for c in ET.fromstring(z.read(t if t.startswith("xl/") else "xl/" + t)).iter(M + "c"):
            kind, v = c.get("t"), c.find(M + "v")
            if kind == "s":
                val = ss[int(v.text)]
            elif kind == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(M + "t"))
            else:
                val = v.text if v is not None else None
            if val is not None and str(val).strip() != "":
                grid[ref(c.get("r"))] = str(val)
        rows = []
        if grid:
            nc = max(c for _, c in grid)
            rows = [[grid.get((r, c)) for c in range(1, nc + 1)] for r in range(1, max(r for r, _ in grid) + 1)]
        out[s.get("name").strip()] = rows
    return out


def num(x):
    x = (x or "").strip().replace(",", "")
    if x in ("", "-"):
        return None
    try:
        d = Decimal(x)
    except Exception:
        return None
    return int(d) if "." not in x else float(d)


def txt(x):
    x = (x or "").strip()
    return None if x in ("", "-") else x


def cell(row, i):
    return row[i] if i < len(row) else None


def overview(rows):
    sec, cur = {}, None
    for r in rows:
        a, b, c = (cell(r, i) for i in range(3))
        if a and b is None and c is None:
            cur = a.strip()
            sec[cur] = []
        elif (b or "").strip() == "Amount" or not txt(a) or cur is None:
            continue
        else:
            sec[cur].append((a.strip(), num(b), num(c)))
    return sec


def table(rows, title):
    """Data rows of a titled block on the Product report sheet (after its header row, up to its Total row)."""
    for i, r in enumerate(rows):
        if (cell(r, 0) or "").strip() == title:
            out = []
            for r2 in rows[i + 2:]:
                if (cell(r2, 0) or "").strip() == "Total":
                    return out
                if any(v is not None for v in r2):
                    out.append(r2)
            return out
    return []


def main():
    if len(sys.argv) < 2:
        fail("usage: pos_report.py INPUT [OUT.sql]")
    xlsx, msg_id = load(sys.argv[1])
    wb = workbook(xlsx)
    need = ["Report Info", "Store orders overview", "Daily Report", "Product report", "Paid order list"]
    missing = [s for s in need if s not in wb]
    if missing:
        fail("not an EZI POS daily report (missing sheets: %s)" % ", ".join(missing))

    info = wb["Report Info"][2]
    store, gen, period = txt(cell(info, 0)), txt(cell(info, 1)), txt(cell(info, 2)) or ""
    if not re.match(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$", gen or ""):
        fail("unreadable generation time %r" % gen)
    days = [r for r in wb["Daily Report"][1:] if re.match(r"\d{4}-\d{2}-\d{2}$", (cell(r, 0) or "").strip())]
    if len(days) != 1:
        fail("report covers %d business days (only single-day reports are imported)" % len(days))
    date = days[0][0].strip()
    if not period.startswith(date):
        fail("time period %r does not match business date %s" % (period, date))

    ov = overview(wb["Store orders overview"])
    sales = {k: (a, q) for k, a, q in ov.get("Sales summary", [])}
    fees = [[k, a] for k, a, _ in ov.get("Fee summary", [])]
    fee = dict(fees)
    pay = [[k, a or 0, q or 0] for k, a, q in ov.get("Payment Method Report", []) if k != "Total"]
    staff = [["cashier", k, a or 0, q or 0] for k, a, q in ov.get("Cashier Report", []) if k != "Total"]
    staff += [["waiter", k, a or 0, q or 0] for k, a, q in ov.get("Order Placed By Report", []) if k != "Total"]
    special = [[k, a or 0, q or 0] for k, a, q in ov.get("Special Case", [])]
    special += [[k, a or 0, 0] for k, a, _ in ov.get("Pay in/Pay out", [])]
    disc = -sum(Decimal(str(fee.get(k) or 0)) for k in ("Dishes discount", "Order discount", "Discount voucher"))
    summ = {
        "orders": sales.get("Paid orders Qty", (None, None))[1],
        "refunded": sales.get("Refunded orders Qty", (None, 0))[1] or 0,
        "product": fee.get("Product") or 0,
        "addon": fee.get("Add-on") or 0,
        "discount": float(disc),
        "tax": sales.get("Tax", (0, None))[0] or 0,
        "paid": sales.get("Total paid", (None, None))[0],
        "refund": sales.get("Total refund", (0, None))[0] or 0,
        "net": fee.get("Net sales"),
        "actual": sales.get("Actual sales", (None, None))[0],
    }
    if summ["orders"] is None or summ["paid"] is None or summ["net"] is None or summ["actual"] is None:
        fail("sales summary incomplete")

    pr = wb["Product report"]
    cats = [[r[0].strip()] + [num(cell(r, i)) or 0 for i in range(1, 8)] for r in table(pr, "Category report")]
    prods, parent = [], None
    for r in table(pr, "Product report"):
        vals = [num(cell(r, i)) or 0 for i in range(2, 9)]
        if txt(cell(r, 0)):
            parent = [r[0].strip(), None, False] + vals
            prods.append(parent)
        elif parent is not None and txt(cell(r, 1)):
            parent[2] = True
            prods.append([parent[0], cell(r, 1).strip(), False] + vals)
    mods, mparent = [], None
    for r in table(pr, "Modifier report"):
        if txt(cell(r, 0)):
            mparent = r[0].strip()
        elif mparent and txt(cell(r, 1)):
            mods.append([mparent, cell(r, 1).strip(), num(cell(r, 2)) or 0])
    adds = []
    for r in table(pr, "Add-on report"):
        if txt(cell(r, 1)):
            adds.append([txt(cell(r, 0)), cell(r, 1).strip(), num(cell(r, 2)) or 0, num(cell(r, 4)) or 0])

    ol = wb["Paid order list"]
    head = [(h or "").strip() for h in ol[0]]
    ix = {h: i for i, h in enumerate(head)}
    try:
        pcols = range(ix["Cash voucher"] + 1, ix["Transaction fee"])
    except KeyError:
        fail("order list columns changed")
    orders, warn = [], []
    for r in ol[1:]:
        oid = txt(cell(r, 0))
        if not oid or oid.startswith("Explanation"):
            continue
        g = lambda h: cell(r, ix[h]) if h in ix else None
        payments = [[head[i], num(cell(r, i))] for i in pcols if num(cell(r, i)) is not None]
        text = g("Products") or ""
        items = [[a.strip(), b, int(n)] for a, b, n in re.findall(r"(.+?)\(([^()]*)\) x (\d+),", text)]
        if sum(i[2] for i in items) != (num(g("Product Qty")) or 0):
            warn.append("order %s: items text not fully read" % oid)
            items = [[text.strip(), None, num(g("Product Qty")) or 0]]
        who = (g("Source") or "").split(":", 1)[-1].strip() or None
        orders.append([oid, txt(g("Payment time")), txt(g("Take up number")), num(g("Total paid")) or 0,
                       num(g("Product Qty")) or 0, num(g("Product amount")) or 0, num(g("Order discount")) or 0,
                       payments, items, who, txt(g("Type/Channel")), txt(g("Status"))])

    def D(x):
        return Decimal(str(x or 0))

    leaf = [p for p in prods if not p[2]]
    checks = [
        ("payment methods add up to total paid", sum(D(p[1]) for p in pay), D(summ["paid"])),
        ("orders per payment method add up to paid orders", sum(D(p[2]) for p in pay), D(summ["orders"])),
        ("order list count equals paid orders", D(len(orders)), D(summ["orders"])),
        ("order totals add up to total paid", sum(D(o[3]) for o in orders), D(summ["paid"])),
        ("category gross equals product amount", sum(D(c[2]) for c in cats), D(summ["product"])),
        ("product net equals category net", sum(D(p[6]) for p in leaf), sum(D(c[4]) for c in cats)),
        ("product qty equals category qty", sum(D(p[3]) for p in leaf), sum(D(c[1]) for c in cats)),
    ]
    for p in prods:
        if p[2]:
            checks.append(("variants of %s add up" % p[0], sum(D(v[3]) for v in prods if v[0] == p[0] and v[1]), D(p[3])))
    bad = ["%s (%s vs %s)" % (n, a, b) for n, a, b in checks if abs(a - b) > Decimal("0.01")]
    if bad:
        fail("totals do not reconcile: " + "; ".join(bad))

    body = {"v": 1, "store": store, "date": date, "gen": gen, "msg": msg_id,
            "sha": hashlib.sha256(xlsx).hexdigest(), "sum": summ, "fees": fees, "pay": pay, "cat": cats,
            "prod": prods, "mod": mods, "add": adds, "ord": orders, "staff": staff, "special": special, "warn": warn}
    n, s, c, k = 0, Decimal(0), 0, 0
    stack = [body]
    while stack:
        x = stack.pop()
        if isinstance(x, dict):
            stack.extend(x.values())
        elif isinstance(x, list):
            stack.extend(x)
        elif isinstance(x, bool) or x is None:
            pass
        elif isinstance(x, (int, float)):
            n, s = n + 1, s + Decimal(str(x))
        elif isinstance(x, str):
            c += len(x)
            k += sum((i + 1) * ord(ch) for i, ch in enumerate(x))
    body["chk"] = {"n": n, "s": float(round(s, 2)), "c": c, "k": k}
    js = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    if "$pos$" in js:
        fail("payload contains the SQL quote marker")
    sql = "select public.pos_import_report($pos$" + js + "$pos$::jsonb) as result;"
    if len(sys.argv) > 2:
        open(sys.argv[2], "w", encoding="utf-8").write(sql + "\n")
    print(sql)
    print("OK %s | generated %s | %s orders | paid AED %s | %d products | %d bytes%s" % (
        date, gen, summ["orders"], summ["paid"], len(leaf), len(sql.encode()), (" | warnings: " + "; ".join(warn)) if warn else ""),
        file=sys.stderr)


main()
