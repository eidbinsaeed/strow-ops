import { createServiceClient } from "@/lib/supabase/server";
import { NeedsYouFlow, type NyItem } from "@/components/pulse/NeedsYouFlow";
import { namesFor, newRowNames, paperFor, splitNote } from "@/lib/ai/action-context";
import { linkTable, REF_NAME } from "@/lib/ai/ops";

export const dynamic = "force-dynamic";

type Op = { op: string; table: string; id?: string; ref?: string; changes?: Record<string, unknown>; values?: Record<string, unknown> };
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
  online_total: "Online", description: "Description", discount: "Discount", payment_method: "Paid by", same_as: "Same as",
  menu_item_id: "Menu item", talabat_total: "Talabat", keeta_total: "Keeta", beanz_total: "Beanz", price: "Price", unit: "Unit", kind: "Kind",
};
const NEW_LABEL: Record<string, string> = {
  inventory_items: "New item", suppliers: "New vendor", categories: "New category", menu_items: "New menu item",
  recipe_lines: "New ingredient", expense_line_items: "New bill line", fixed_costs: "New recurring cost", liabilities: "Money owed",
  stock_items: "New count-list item", cash_events: "Cash event",
};
const READABLE = new Set(["closings", "expenses", "expense_line_items", "suppliers", "categories", "inventory_items", "item_aliases", "fixed_costs", "liabilities", "menu_items", "recipe_lines", "stock_items"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
const clip = (s: string, n = 46) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

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

  // Current rows behind proposed updates and deletes (the before-state is captured only when applied).
  const need = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, t: string, id: string) => {
    if (!m.has(t)) m.set(t, new Set());
    m.get(t)!.add(id.toLowerCase());
  };
  for (const r of rows) {
    (r.ops ?? []).forEach((o, k) => {
      if (o.op !== "insert" && o.id && UUID.test(o.id) && READABLE.has(o.table) && !(r.before && r.before[k])) add(need, o.table, o.id);
    });
  }
  const current = new Map<string, Record<string, unknown>>();
  await Promise.all(
    [...need.entries()].map(async ([t, ids]) => {
      const { data: got } = await db.from(t).select("*").in("id", [...ids]).limit(200);
      for (const row of (got ?? []) as Record<string, unknown>[]) current.set(`${t}:${String(row.id).toLowerCase()}`, row);
    }),
  );
  const rowOf = (r: Row, o: Op, k: number) => (r.before && r.before[k]) || current.get(`${o.table}:${String(o.id).toLowerCase()}`) || null;

  // Readable names for every linked row (now and should-be).
  const linked = new Map<string, Set<string>>();
  for (const r of rows) {
    (r.ops ?? []).forEach((o, k) => {
      const cols = { ...(rowOf(r, o, k) ?? {}), ...(o.changes ?? {}), ...(o.values ?? {}) };
      for (const [c, v] of Object.entries(cols)) {
        const t = linkTable(o.table, c);
        if (t && typeof v === "string" && UUID.test(v)) add(linked, t, v);
      }
    });
  }
  const names = await namesFor(linked);

  // The bill or closing each finding is about, for its photo and the line under the title.
  const paper = await paperFor(rows);
  const expIds = [...new Set([...paper.values()].filter((p) => p.table === "expenses").map((p) => p.id))];
  const clsIds = [...new Set([...paper.values()].filter((p) => p.table === "closings").map((p) => p.id))];
  type Exp = { id: string; expense_date: string | null; invoice_number: string | null; total: number | string | null; photo_drive_url: string | null; supplier: { name: string } | { name: string }[] | null };
  type Cls = { id: string; closing_date: string; grand_total: number | string | null; photo_drive_url: string | null };
  const expMap = new Map<string, Exp>();
  const clsMap = new Map<string, Cls>();
  await Promise.all([
    expIds.length
      ? db.from("expenses").select("id, expense_date, invoice_number, total, photo_drive_url, supplier:suppliers(name)").in("id", expIds).then(({ data: ex }) => {
          for (const e of (ex ?? []) as Exp[]) expMap.set(e.id, e);
        })
      : null,
    clsIds.length
      ? db.from("closings").select("id, closing_date, grand_total, photo_drive_url").in("id", clsIds).then(({ data: cl }) => {
          for (const c of (cl ?? []) as Cls[]) clsMap.set(c.id, c);
        })
      : null,
  ]);

  const items: NyItem[] = rows.map((r) => {
    let photo: NyItem["photo"] = null;
    let context: string | null = null;
    const p = paper.get(r.id);
    if (p?.table === "expenses") {
      const e = expMap.get(p.id);
      if (e) {
        if (e.photo_drive_url) photo = { table: "expenses", id: e.id };
        const sup = Array.isArray(e.supplier) ? e.supplier[0]?.name : e.supplier?.name;
        context = [sup, e.invoice_number ? `Invoice ${e.invoice_number}` : null, e.expense_date ? date(e.expense_date) : null, e.total != null ? `AED ${show(e.total)}` : null]
          .filter(Boolean)
          .join(" · ") || null;
      }
    } else if (p?.table === "closings") {
      const c = clsMap.get(p.id);
      if (c) {
        if (c.photo_drive_url) photo = { table: "closings", id: c.id };
        context = `Closing · ${date(c.closing_date)} · AED ${show(c.grand_total)}`;
      }
    }

    // New rows this fix creates, by the token other ops point at them with.
    const ops = r.ops ?? [];
    const fresh = newRowNames(ops);
    const insertsInto = (t: string) => ops.filter((o) => o.op === "insert" && o.table === t);
    const nameOf = (table: string, col: string, v: unknown): string => {
      if (v === null || v === undefined || v === "") return col === "inventory_item_id" ? "Not linked" : "—";
      const s = String(v);
      if (REF_NAME.test(s)) return fresh.has(s) ? `${clip(fresh.get(s)!, 40)} (new)` : "new record";
      const t = linkTable(table, col);
      if (t && UUID.test(s)) {
        const known = names.get(`${t}:${s.toLowerCase()}`) ?? fresh.get(s.toLowerCase());
        if (known) return names.has(`${t}:${s.toLowerCase()}`) ? clip(known, 44) : `${clip(known, 40)} (new)`;
        // An older fix that made up an id for the one row it creates: that row.
        const only = insertsInto(t);
        const nm = only.length === 1 ? String(only[0].values?.name ?? only[0].values?.raw_text ?? "") : "";
        if (nm) return `${clip(nm, 40)} (new)`;
        return "linked record";
      }
      return show(v);
    };

    const diffs: NyItem["diffs"] = [];
    ops.forEach((o, k) => {
      if (diffs.length >= 4) return;
      const cur = rowOf(r, o, k) ?? {};
      const what = o.table === "expense_line_items" && cur.description ? `Bill line: ${clip(String(cur.description), 60)}` : undefined;
      if (o.op === "update" && o.changes) {
        let first = true;
        for (const [f, v] of Object.entries(o.changes)) {
          if (diffs.length >= 4) break;
          diffs.push({ label: FIELD[f] ?? f.replace(/_/g, " "), from: nameOf(o.table, f, cur[f]), to: nameOf(o.table, f, v), what: first ? what : undefined });
          first = false;
        }
      } else if (o.op === "delete") {
        diffs.push({ label: o.table === "expense_line_items" ? "Extra line" : `Remove ${o.table.replace(/_/g, " ")}`, from: cur.description ? clip(String(cur.description)) : "In the bill", to: "Removed" });
      } else if (o.op === "insert") {
        const v = o.values ?? {};
        if (o.table === "item_aliases") {
          diffs.push({ label: "Bill spelling", from: `“${clip(String(v.raw_text ?? v.norm ?? ""), 30)}”`, to: `= ${nameOf("item_aliases", "inventory_item_id", v.inventory_item_id)}` });
        } else if (o.table === "expense_line_items") {
          diffs.push({ label: NEW_LABEL[o.table], from: "—", to: `${clip(String(v.description ?? "Line"), 32)}${v.line_total != null ? ` · AED ${show(v.line_total)}` : ""}` });
        } else {
          const nm = v.name ?? v.label ?? v.counterparty ?? v.description;
          diffs.push({ label: NEW_LABEL[o.table] ?? `New ${o.table.replace(/_/g, " ")}`, from: "—", to: nm ? clip(String(nm)) : "Added" });
        }
      }
    });

    const { note, detail } = splitNote(r.detail);
    return {
      id: r.id,
      status: r.status,
      severity: r.severity,
      title: r.title,
      detail,
      note,
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
      {/* A new id in the URL (after "Redo with my note") starts the flow again on that finding. */}
      <NeedsYouFlow key={sp.id ?? "start"} items={items} start={start} />
    </div>
  );
}
