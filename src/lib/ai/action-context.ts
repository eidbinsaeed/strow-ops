/**
 * What an AI finding is about, in the owner's terms: the bill or closing
 * (so its photo can sit next to the finding) and readable names for the rows
 * its changes point at ("Banana — fresh" instead of "linked record").
 * Used by Needs you and by "Redo with my note".
 */
import { createServiceClient } from "@/lib/supabase/server";
import { REF_NAME } from "./ops";

type LooseOp = { op: string; table: string; id?: string; ref?: string; changes?: Record<string, unknown>; values?: Record<string, unknown> };
export type ActionLite = {
  id: string;
  title: string;
  detail: string | null;
  ops: LooseOp[] | null;
  entity_table: string | null;
  entity_id: string | null;
};
export type Paper = { table: "expenses" | "closings"; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Invoice numbers named in a finding's text: "invoice 0263", "bill IAEGAS707U3WWO_5A", "inv. #340891". */
export function invoiceTokens(text: string): string[] {
  const out = new Set<string>();
  const re = /\b(?:invoice|inv|bill|receipt|order)\b\.?\s*(?:no\.?|number|#)?\s*:?\s*#?([A-Z0-9][A-Z0-9_\-\/]{2,})/gi;
  for (const m of text.matchAll(re)) {
    const t = m[1].replace(/[.,;:)]+$/, "");
    if (/\d/.test(t) && !UUID.test(t) && t.length <= 40) out.add(t);
  }
  return [...out];
}

/** The bill or closing behind each finding, by id of the finding. */
export async function paperFor(rows: ActionLite[]): Promise<Map<string, Paper>> {
  const db = createServiceClient();
  const out = new Map<string, Paper>();
  const want = new Map<string, { lines: string[]; exps: string[]; aliasTexts: string[]; aliasItems: string[]; invoices: string[]; text: string }>();

  for (const r of rows) {
    if (r.entity_table === "closings" && isId(r.entity_id)) {
      out.set(r.id, { table: "closings", id: r.entity_id });
      continue;
    }
    const w = { lines: [] as string[], exps: [] as string[], aliasTexts: [] as string[], aliasItems: [] as string[], invoices: [] as string[], text: `${r.title} ${r.detail ?? ""}` };
    if (r.entity_table === "expenses" && isId(r.entity_id)) w.exps.push(r.entity_id);
    if (r.entity_table === "expense_line_items" && isId(r.entity_id)) w.lines.push(r.entity_id);
    let closing: string | null = null;
    for (const o of r.ops ?? []) {
      if (o.table === "expense_line_items" && o.op !== "insert" && isId(o.id)) w.lines.push(o.id);
      if (o.table === "expense_line_items" && o.op === "insert" && isId(o.values?.expense_id)) w.exps.push(o.values.expense_id as string);
      if (o.table === "expenses" && o.op === "update" && isId(o.id)) w.exps.push(o.id);
      if (o.table === "closings" && o.op === "update" && isId(o.id)) closing ??= o.id;
      if (o.table === "item_aliases" && o.op === "insert") {
        const t = str(o.values?.raw_text);
        if (t) w.aliasTexts.push(t);
        if (isId(o.values?.inventory_item_id)) w.aliasItems.push(o.values.inventory_item_id as string);
      }
    }
    if (!w.lines.length && !w.exps.length && closing) {
      out.set(r.id, { table: "closings", id: closing });
      continue;
    }
    w.invoices = invoiceTokens(w.text);
    want.set(r.id, w);
  }
  if (!want.size) return out;

  // Bill lines → their bill.
  const allLines = [...new Set([...want.values()].flatMap((w) => w.lines))];
  const lineToExp = new Map<string, string>();
  if (allLines.length) {
    const { data } = await db.from("expense_line_items").select("id, expense_id").in("id", allLines);
    for (const l of (data ?? []) as { id: string; expense_id: string }[]) lineToExp.set(l.id, l.expense_id);
  }

  // An alias with nothing else to go on: the newest bill whose line reads exactly that text.
  const aliasTexts = [...new Set([...want.values()].flatMap((w) => (w.lines.length || w.exps.length ? [] : w.aliasTexts)))];
  const byText = new Map<string, { expense_id: string; item: string | null; date: string }[]>();
  if (aliasTexts.length) {
    const { data } = await db
      .from("expense_line_items")
      .select("expense_id, description, inventory_item_id, expense:expenses(expense_date, status)")
      .in("description", aliasTexts)
      .limit(200);
    type L = { expense_id: string; description: string; inventory_item_id: string | null; expense: { expense_date: string; status: string } | { expense_date: string; status: string }[] | null };
    for (const l of (data ?? []) as L[]) {
      const e = Array.isArray(l.expense) ? l.expense[0] : l.expense;
      if (!e || e.status === "rejected") continue;
      const list = byText.get(l.description) ?? [];
      list.push({ expense_id: l.expense_id, item: l.inventory_item_id, date: e.expense_date ?? "" });
      byText.set(l.description, list);
    }
  }

  // Invoice numbers named in the text.
  const tokens = [...new Set([...want.values()].flatMap((w) => (w.lines.length || w.exps.length ? [] : w.invoices)))];
  const byInvoice = new Map<string, { id: string; supplier: string; date: string }[]>();
  if (tokens.length) {
    const { data } = await db
      .from("expenses")
      .select("id, invoice_number, expense_date, status, supplier:suppliers(name)")
      .in("invoice_number", tokens)
      .limit(100);
    type E = { id: string; invoice_number: string; expense_date: string; status: string; supplier: { name: string } | { name: string }[] | null };
    for (const e of (data ?? []) as E[]) {
      if (e.status === "rejected") continue;
      const sup = Array.isArray(e.supplier) ? e.supplier[0]?.name : e.supplier?.name;
      const list = byInvoice.get(e.invoice_number) ?? [];
      list.push({ id: e.id, supplier: sup ?? "", date: e.expense_date ?? "" });
      byInvoice.set(e.invoice_number, list);
    }
  }

  for (const [actionId, w] of want) {
    const direct = w.exps[0] ?? w.lines.map((l) => lineToExp.get(l)).find(Boolean);
    if (direct) {
      out.set(actionId, { table: "expenses", id: direct });
      continue;
    }
    const lower = w.text.toLowerCase();
    const viaInvoice = w.invoices
      .flatMap((t) => byInvoice.get(t) ?? [])
      .sort((a, b) => Number(lower.includes(b.supplier.split(/\s+/)[0]?.toLowerCase() || "\u0000")) - Number(lower.includes(a.supplier.split(/\s+/)[0]?.toLowerCase() || "\u0000")) || b.date.localeCompare(a.date))[0];
    if (viaInvoice) {
      out.set(actionId, { table: "expenses", id: viaInvoice.id });
      continue;
    }
    const viaAlias = w.aliasTexts
      .flatMap((t) => byText.get(t) ?? [])
      .sort((a, b) => Number(w.aliasItems.includes(b.item ?? "")) - Number(w.aliasItems.includes(a.item ?? "")) || b.date.localeCompare(a.date))[0];
    if (viaAlias) out.set(actionId, { table: "expenses", id: viaAlias.expense_id });
  }
  return out;
}

/** Tables whose rows have a name worth showing instead of an id. */
const NAMED: Record<string, string> = {
  inventory_items: "name",
  suppliers: "name",
  categories: "name",
  menu_items: "name",
  baristas: "name",
  stock_items: "name",
};

/** "table:id" → readable name, for every id in `ids` (grouped by table). */
export async function namesFor(ids: Map<string, Set<string>>): Promise<Map<string, string>> {
  const db = createServiceClient();
  const out = new Map<string, string>();
  await Promise.all(
    [...ids.entries()].map(async ([table, set]) => {
      const col = NAMED[table];
      const list = [...set].filter(isId);
      if (!col || !list.length) return;
      const { data } = await db.from(table).select(`id, ${col}`).in("id", list).limit(500);
      for (const r of (data ?? []) as unknown as Record<string, unknown>[]) out.set(`${table}:${String(r.id).toLowerCase()}`, String(r[col] ?? ""));
    }),
  );
  return out;
}

/** The readable name of a new row an op creates ("$nadec_milk" → "Nadec Long Life Milk Full Fat"). */
export function newRowNames(ops: LooseOp[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of ops) {
    if (o.op !== "insert") continue;
    const name = str(o.values?.name) ?? str(o.values?.raw_text) ?? str(o.values?.description);
    if (!name) continue;
    if (o.ref) out.set(REF_NAME.test(o.ref) ? o.ref : o.ref.toLowerCase(), name);
  }
  return out;
}

/** The note the owner wrote when he asked for a redo, kept at the top of the new finding's detail. */
export const NOTE_PREFIX = "Owner note: ";
export function splitNote(detail: string | null): { note: string | null; detail: string | null } {
  if (!detail || !detail.startsWith(NOTE_PREFIX)) return { note: null, detail };
  const nl = detail.indexOf("\n");
  if (nl < 0) return { note: detail.slice(NOTE_PREFIX.length).trim() || null, detail: null };
  return { note: detail.slice(NOTE_PREFIX.length, nl).trim() || null, detail: detail.slice(nl + 1).trim() || null };
}
