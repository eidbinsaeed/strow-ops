/**
 * The VAT return as an Excel file for the accountant: the VAT 201 boxes,
 * sales by day, every bill (with whether its VAT was counted and why not),
 * and the months.
 */
import ExcelJS from "exceljs";
import type { VatReturn } from "./vat";

const MONEY = "#,##0.00";
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHECK: Record<string, string> = {
  no_trn: "Supplier TRN not on file — VAT not counted",
  proforma: "Proforma, not a tax invoice — VAT not counted",
  no_photo: "No photo of the bill saved",
  not_approved: "Not approved yet",
};

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function vatWorkbook(v: VatReturn): Promise<ArrayBuffer> {
  const { from, to } = v;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Strow Ops";
  wb.created = new Date();
  const bold = { bold: true };
  const head = (ws: ExcelJS.Worksheet, n: number) => {
    const row = ws.getRow(n);
    row.font = bold;
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F7" } };
  };

  // ---- VAT 201
  const s = wb.addWorksheet("VAT 201");
  s.columns = [{ width: 8 }, { width: 52 }, { width: 18 }, { width: 18 }, { width: 14 }];
  s.addRow(["Qave Cafe — VAT return"]).font = { bold: true, size: 14 };
  s.addRow(["Period", `${from} to ${to}`]);
  s.addRow(["Due (return and payment)", v.due]);
  s.addRow(["VAT rate", `${Math.round(v.rate * 1000) / 10}%`]);
  s.addRow([]);
  s.addRow(["Box", "Description", "Amount (AED)", "VAT (AED)", "Adjustment"]);
  head(s, 6);
  const boxes: (string | number | null)[][] = [
    ["1a", "Standard rated supplies in Abu Dhabi (sales, excl. VAT)", v.boxes.b1aAmount, v.boxes.b1aVat, 0],
    ["9", "Standard rated expenses (bills with a supplier TRN, excl. VAT)", v.boxes.b9Amount, v.boxes.b9Vat, 0],
    ["12", "Total value of due tax for the period", null, v.boxes.b12, null],
    ["13", "Total value of recoverable tax for the period", null, v.boxes.b13, null],
    ["14", v.boxes.b14 >= 0 ? "Payable tax for the period" : "Refundable tax for the period", null, Math.abs(v.boxes.b14), null],
  ];
  for (const b of boxes) s.addRow(b);
  for (let r = 7; r <= 11; r++) for (const c of [3, 4, 5]) s.getCell(r, c).numFmt = MONEY;
  s.getRow(11).font = bold;
  s.addRow([]);
  s.addRow(["", "Strow has nothing for boxes 2–8 and 10 (tourist refunds, zero-rated or exempt sales, imports, reverse charge)."]);
  s.addRow(["", "Services billed from abroad (online ads, software) may need reverse charge in boxes 3 and 10 — ask your accountant."]);
  s.addRow([]);
  s.addRow(["", "Check before you file"]).font = bold;
  const vatOf = (list: { vat: number }[]) => list.reduce((a, b) => a + b.vat, 0);
  const bills = (n: number) => `${n} bill${n === 1 ? "" : "s"}`;
  const notes: [string, number | string][] = [
    ["Bills with VAT but no supplier TRN on file (VAT not counted)", `${bills(v.checks.noTrn.length)} · AED ${vatOf(v.checks.noTrn).toFixed(2)}`],
    ["Proformas (VAT not counted until the tax invoice is in)", `${bills(v.checks.proforma.length)} · AED ${vatOf(v.checks.proforma).toFixed(2)}`],
    ["Bills with no photo saved", bills(v.checks.noPhoto.length)],
    ["Days with no closing", v.sales.missing.length ? v.sales.missing.join(", ") : "none"],
  ];
  for (const n of notes) s.addRow(["", ...n]);

  // ---- Sales by day
  const d = wb.addWorksheet("Sales by day");
  d.columns = [
    { header: "Date", width: 12 },
    { header: "Day", width: 6 },
    { header: "Cash", width: 12 },
    { header: "Card", width: 12 },
    { header: "Delivery apps", width: 14 },
    { header: "Total incl. VAT", width: 16 },
    { header: "Excl. VAT", width: 14 },
    { header: "VAT", width: 12 },
    { header: "Status", width: 14 },
  ];
  head(d, 1);
  for (const x of v.sales.days) d.addRow([asDate(x.date), WD[new Date(`${x.date}T00:00:00Z`).getUTCDay()], x.cash, x.card, x.apps, x.total, x.base, x.vat, x.status]);
  const dn = v.sales.days.length + 1;
  const tr = d.addRow(["Total", "", ...["C", "D", "E", "F", "G", "H"].map((c) => ({ formula: `SUM(${c}2:${c}${dn})` }))]);
  tr.font = bold;
  d.eachRow((row, i) => {
    if (i > 1) for (const c of [3, 4, 5, 6, 7, 8]) row.getCell(c).numFmt = MONEY;
    if (i > 1) row.getCell(1).numFmt = "dd/mm/yyyy";
  });
  d.views = [{ state: "frozen", ySplit: 1 }];
  d.autoFilter = { from: "A1", to: `I${dn}` };

  // ---- Purchases
  const p = wb.addWorksheet("Purchases");
  p.columns = [
    { header: "Date", width: 12 },
    { header: "Supplier", width: 34 },
    { header: "Supplier TRN", width: 18 },
    { header: "Invoice no.", width: 16 },
    { header: "Category", width: 18 },
    { header: "Excl. VAT", width: 13 },
    { header: "VAT", width: 11 },
    { header: "Total", width: 13 },
    { header: "VAT counted", width: 12 },
    { header: "Check", width: 48 },
    { header: "Payment", width: 10 },
    { header: "Photo", width: 8 },
  ];
  head(p, 1);
  for (const b of v.purchases.bills)
    p.addRow([
      asDate(b.date),
      b.supplier ?? "(no supplier)",
      b.trn ?? "",
      b.invoice ?? "",
      b.category ?? "",
      b.subtotal,
      b.vat,
      b.total,
      b.vat > 0 ? (b.claim ? "Yes" : "No") : "—",
      b.checks.map((c) => CHECK[c]).join("; "),
      b.payment ?? "",
      b.photoId ? "Yes" : "No",
    ]);
  const pn = v.purchases.bills.length + 1;
  const pt = p.addRow(["Total", "", "", "", "", { formula: `SUM(F2:F${pn})` }, { formula: `SUM(G2:G${pn})` }, { formula: `SUM(H2:H${pn})` }, `Counted: ${v.purchases.claimVat.toFixed(2)}`]);
  pt.font = bold;
  p.eachRow((row, i) => {
    if (i > 1) for (const c of [6, 7, 8]) row.getCell(c).numFmt = MONEY;
    if (i > 1) row.getCell(1).numFmt = "dd/mm/yyyy";
  });
  p.views = [{ state: "frozen", ySplit: 1 }];
  p.autoFilter = { from: "A1", to: `L${pn}` };

  // ---- Months
  const m = wb.addWorksheet("Months");
  m.columns = [
    { header: "Month", width: 18 },
    { header: "Days closed", width: 12 },
    { header: "Sales incl. VAT", width: 16 },
    { header: "Sales excl. VAT", width: 16 },
    { header: "Output VAT", width: 13 },
    { header: "Bills", width: 8 },
    { header: "Bills excl. VAT", width: 15 },
    { header: "VAT on bills", width: 13 },
    { header: "VAT counted", width: 13 },
  ];
  head(m, 1);
  for (const x of v.months) m.addRow([x.label, `${x.closed} of ${x.days}`, x.total, x.base, x.vat, x.bills, x.billBase, x.billVat, x.claimVat]);
  m.eachRow((row, i) => {
    if (i > 1) for (const c of [3, 4, 5, 7, 8, 9]) row.getCell(c).numFmt = MONEY;
  });

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
