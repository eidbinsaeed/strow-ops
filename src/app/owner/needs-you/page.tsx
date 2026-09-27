import { createServiceClient } from "@/lib/supabase/server";
import { NeedsYouFlow, type NyItem } from "@/components/pulse/NeedsYouFlow";

export const dynamic = "force-dynamic";

type Op = { op: string; table: string; id?: string; changes?: Record<string, unknown>; values?: Record<string, unknown> };
type Row = {
  id: string;
  status: string;
  severity: string;
  title: string;
  detail: string | null;
  confidence: number | null;
  ops: Op[] | null;
  before: (Record<string, unknown> | null)[] | null;
  entity_table: string | null;
  entity_id: string | null;
};

const FIELD: Record<string, string> = {
  quantity: "Quantity", unit_price: "Unit price", line_total: "Line total", subtotal: "Subtotal", vat_amount: "VAT", total: "Total",
  expense_date: "Bill date", closing_date: "Closing date", invoice_number: "Invoice no.", supplier_id: "Vendor", category_id: "Category",
  inventory_item_id: "Item", status: "Status", is_active: "Active", name: "Name", cash_total: "Cash", card_total: "Card",
  online_total: "Online", description: "Description", discount: "Discount", payment_method: "Paid by",
};
const READABLE = new Set(["closings", "expenses", "expense_line_items", "suppliers", "categories", "inventory_items", "item_aliases", "fixed_costs", "liabilities"]);
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const s = String(v);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return "linked record";
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return date(s);
  return s.length > 42 ? s.slice(0, 41) + "…" : s;
}
function date(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : `${d.getUTCDate()} ${MO[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default async function NeedsYouPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const db = createServiceClient();
  const { data } = await db
    .from("ai_actions")
    .select("id, status, severity, title, detail, confidence, ops, before, entity_table, entity_id")
    .in("status", ["proposed", "info"])
    .order("created_at", { ascending: false })
    .limit(60);
  const rank: Record<string, number> = { critical: 0, warn: 1, info: 2 };
  const rows = ((data ?? []) as Row[]).sort((a, b) => {
    const k = (r: Row) => (r.status === "proposed" && r.ops?.length ? 0 : r.status === "info" ? 1 + (rank[r.severity] ?? 2) : 5);
    return k(a) - k(b);
  });

  // Current values for proposed updates (their before-state is captured only when applied).
  const need = new Map<string, Set<string>>();
  for (const r of rows) {
    (r.ops ?? []).forEach((o, k) => {
      if (o.op === "update" && o.id && READABLE.has(o.table) && !(r.before && r.before[k])) {
        if (!need.has(o.table)) need.set(o.table, new Set());
        need.get(o.table)!.add(o.id);
      }
    });
  }
  const current = new Map<string, Record<string, unknown>>();
  await Promise.all(
    [...need.entries()].map(async ([t, ids]) => {
      const { data: got } = await db.from(t).select("*").in("id", [...ids]).limit(200);
      for (const row of (got ?? []) as Record<string, unknown>[]) current.set(`${t}:${String(row.id)}`, row);
    }),
  );

  // Context + photo for the record each finding is about.
  const lineIds = rows.filter((r) => r.entity_table === "expense_line_items" && r.entity_id).map((r) => r.entity_id as string);
  const lineMap = new Map<string, string>();
  if (lineIds.length) {
    const { data: lines } = await db.from("expense_line_items").select("id, expense_id").in("id", lineIds);
    for (const l of (lines ?? []) as { id: string; expense_id: string }[]) lineMap.set(l.id, l.expense_id);
  }
  const expIds = [...new Set([...rows.filter((r) => r.entity_table === "expenses" && r.entity_id).map((r) => r.entity_id as string), ...lineMap.values()])];
  const clsIds = rows.filter((r) => r.entity_table === "closings" && r.entity_id).map((r) => r.entity_id as string);
  type Exp = { id: string; expense_date: string | null; invoice_number: string | null; photo_drive_url: string | null; supplier: { name: string } | { name: string }[] | null };
  type Cls = { id: string; closing_date: string; grand_total: number | string | null; photo_drive_url: string | null };
  const expMap = new Map<string, Exp>();
  const clsMap = new Map<string, Cls>();
  if (expIds.length) {
    const { data: ex } = await db.from("expenses").select("id, expense_date, invoice_number, photo_drive_url, supplier:suppliers(name)").in("id", expIds);
    for (const e of (ex ?? []) as Exp[]) expMap.set(e.id, e);
  }
  if (clsIds.length) {
    const { data: cl } = await db.from("closings").select("id, closing_date, grand_total, photo_drive_url").in("id", clsIds);
    for (const c of (cl ?? []) as Cls[]) clsMap.set(c.id, c);
  }

  const items: NyItem[] = rows.map((r) => {
    let photo: NyItem["photo"] = null;
    let context: string | null = null;
    const expId = r.entity_table === "expenses" ? r.entity_id : r.entity_table === "expense_line_items" && r.entity_id ? lineMap.get(r.entity_id) ?? null : null;
    if (expId) {
      const e = expMap.get(expId);
      if (e) {
        if (e.photo_drive_url) photo = { table: "expenses", id: e.id };
        const sup = Array.isArray(e.supplier) ? e.supplier[0]?.name : e.supplier?.name;
        context = [sup, e.invoice_number ? `Invoice ${e.invoice_number}` : null, e.expense_date ? date(e.expense_date) : null].filter(Boolean).join(" · ") || null;
      }
    }
    if (r.entity_table === "closings" && r.entity_id) {
      const c = clsMap.get(r.entity_id);
      if (c) {
        if (c.photo_drive_url) photo = { table: "closings", id: c.id };
        context = `Closing · ${date(c.closing_date)} · AED ${show(c.grand_total)}`;
      }
    }
    const diffs: NyItem["diffs"] = [];
    (r.ops ?? []).forEach((o, k) => {
      if (diffs.length >= 4) return;
      if (o.op === "update" && o.changes) {
        const before = (r.before && r.before[k]) || current.get(`${o.table}:${o.id}`) || {};
        for (const [f, v] of Object.entries(o.changes)) {
          if (diffs.length >= 4) break;
          diffs.push({ label: FIELD[f] ?? f.replace(/_/g, " "), from: show((before as Record<string, unknown>)[f]), to: show(v) });
        }
      } else if (o.op === "delete") diffs.push({ label: "Extra line", from: "In the bill", to: "Removed" });
      else if (o.op === "insert") diffs.push({ label: `New ${o.table.replace(/_/g, " ")}`, from: "—", to: "Added" });
    });
    return {
      id: r.id,
      status: r.status,
      severity: r.severity,
      title: r.title,
      detail: r.detail,
      confidence: r.confidence,
      hasOps: Array.isArray(r.ops) && r.ops.length > 0,
      opsCount: r.ops?.length ?? 0,
      diffs,
      photo,
      context,
      entityTable: r.entity_table,
      entityId: r.entity_id,
    };
  });
  const start = Math.max(0, items.findIndex((x) => x.id === sp.id));

  return (
    <div className="page">
      <NeedsYouFlow items={items} start={start} />
    </div>
  );
}
