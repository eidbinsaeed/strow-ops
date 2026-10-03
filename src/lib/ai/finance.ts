/**
 * "المساعد المالي" — the personal-finance side of Strow AI: its own tools and prompt.
 * Reads Eid's budget with the same maths as the finance page (lib/finance/model),
 * and records every change in ai_actions with its before-state so each has Undo.
 * The café chat and Autopilot never get these tools; a finance backup is taken
 * (once a day) before the first AI write.
 */
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { createServiceClient } from "@/lib/supabase/server";
import { todayDubai } from "@/lib/dates";
import { loadFinance } from "@/lib/finance/load";
import { MAN, ORDER, SECT, makeModel, mLabel, type SecKey } from "@/lib/finance/model";
import { backupFinance } from "@/lib/finance/backup";
import { TOOLS, executeTool, type ToolContext, type ToolOutcome } from "./tools";
import type { ActionBlock } from "./types";

type Json = Record<string, unknown>;
const TITLE: Record<string, string> = Object.fromEntries(SECT.map((s) => [s.k, s.t]));
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const isSec = (v: unknown): v is SecKey => typeof v === "string" && (MAN as string[]).includes(v);
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const num = (v: unknown): number => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};
const fail = (m: string): ToolOutcome => ({ content: m, isError: true });

export function currentPlanMonth(): string {
  const now = todayDubai().slice(0, 7);
  return ORDER.includes(now) ? now : ORDER[0];
}
function monthArg(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}$/.test(s) ? s : currentPlanMonth();
}

async function locationId(): Promise<string | null> {
  const { data } = await createServiceClient().from("locations").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function record(ctx: ToolContext, a: { title: string; detail: string; ops: unknown[]; before: unknown[]; table: string; entityId: string | null }) {
  const { data } = await createServiceClient()
    .from("ai_actions")
    .insert({
      source: "chat",
      status: "applied",
      severity: "info",
      title: a.title.slice(0, 200),
      detail: a.detail,
      confidence: 1,
      ops: a.ops,
      before: a.before,
      applied_at: new Date().toISOString(),
      entity_table: a.table,
      entity_id: a.entityId,
      chat_id: ctx.chatId ?? null,
    })
    .select("id")
    .single();
  const id = (data as { id?: string } | null)?.id;
  if (!id) return;
  ctx.actions.push({ id, status: "applied" });
  const block: ActionBlock = { type: "action", id, title: a.title, detail: a.detail, status: "applied", opsCount: a.ops.length, entityTable: a.table, entityId: a.entityId };
  ctx.blocks.push(block);
  ctx.emit({ t: "block", block });
}

async function findLine(loc: string, month: string, section: SecKey, label: string) {
  const { data } = await createServiceClient().from("finance_budget_lines").select("*").eq("location_id", loc).eq("month", month).eq("section", section).order("position");
  const rows = (data ?? []) as Json[];
  const want = norm(label);
  const hit =
    rows.find((r) => norm(r.label) === want) ??
    rows.find((r) => {
      const l = norm(r.label);
      return (want && l.includes(want)) || (l.length > 1 && want.includes(l));
    }) ??
    null;
  return { hit, labels: rows.map((r) => String(r.label ?? "")) };
}

const SEC_GUIDE =
  "income=الدخل (راتب، إيجار، أرباح) · expense=المصاريف (البيت، السيارة وصيانتها، مشتريات عامة) · wife=تحويل الزوجة · bills=الفواتير (كهرباء، ماء، إنترنت، جوال، اشتراكات) · debt=سداد الديون (label = اسم الشخص) · personal=مصروفي الشخصي (مطاعم، قهوة، ملابس، ترفيه، هدايا) · reserve=الاحتياطي / الطوارئ (ادخار)";

export const FINANCE_TOOLS: Tool[] = [
  {
    name: "finance_summary",
    description:
      "Eid's personal budget, computed exactly like the finance page: a month's lines per section (paid or not), totals, installments due, the 24-month series (actual + planned), installment plans, debts per person, café profit. Call it first for any question.",
    input_schema: { type: "object", properties: { month: { type: "string", description: "YYYY-MM (default: this month)" } } },
  },
  {
    name: "finance_add_line",
    description: `Add a line to a month's budget, e.g. "this month I paid 4000 for car repair". paid=true when he already paid/received it. Sections: ${SEC_GUIDE}. Installments: use finance_installment_paid instead.`,
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM (default: this month)" },
        section: { type: "string", enum: MAN },
        label: { type: "string" },
        amount: { type: "number" },
        paid: { type: "boolean", description: "default true" },
      },
      required: ["section", "label", "amount"],
    },
  },
  {
    name: "finance_update_line",
    description: "Change an existing budget line: amount, name, paid/unpaid, or move it to another section. Find it by its current section and label (exact or part of it).",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string" },
        section: { type: "string", enum: MAN },
        label: { type: "string" },
        new_label: { type: "string" },
        new_amount: { type: "number" },
        new_section: { type: "string", enum: MAN },
        paid: { type: "boolean" },
      },
      required: ["section", "label"],
    },
  },
  {
    name: "finance_delete_line",
    description: "Remove a line from a month's budget (the owner can undo it).",
    input_schema: {
      type: "object",
      properties: { month: { type: "string" }, section: { type: "string", enum: MAN }, label: { type: "string" } },
      required: ["section", "label"],
    },
  },
  {
    name: "finance_installment_paid",
    description: "Mark an installment plan paid (or unpaid) for a month.",
    input_schema: {
      type: "object",
      properties: { plan: { type: "string", description: "plan name or part of it" }, month: { type: "string" }, paid: { type: "boolean", description: "default true" } },
      required: ["plan"],
    },
  },
  TOOLS.query_db,
  TOOLS.show_chart,
  TOOLS.show_table,
  TOOLS.show_stats,
  TOOLS.suggest_followups,
];

async function summary(i: Json): Promise<ToolOutcome> {
  const d = await loadFinance();
  const m = monthArg(i.month);
  if (!d.order.includes(m)) return fail(`${m} is outside the plan (${d.order[0]} … ${d.order[d.order.length - 1]}).`);
  const md = makeModel(d);
  const ser = md.series();
  const at = d.order.indexOf(m);
  const cur = currentPlanMonth();
  const ci = Math.max(d.order.indexOf(cur), 0);
  const outPlanned = md.plannedOut(m), outPaid = md.outOf(m), incPlanned = md.plannedIncome(m);
  const data = {
    today: todayDubai(),
    current_month: cur,
    month: m,
    month_label: mLabel(m),
    totals: {
      income_planned: incPlanned,
      income_received: md.incomeOf(m),
      out_planned: outPlanned,
      out_paid: outPaid,
      left_after_commitments: incPlanned - outPlanned,
      remaining_to_pay: Math.max(outPlanned - outPaid, 0),
      balance_since_start: Math.round(ser[at].leftover),
    },
    sections: MAN.map((k) => ({ section: k, title: TITLE[k], planned: md.sumAll(m, k), paid: md.sumChk(m, k), lines: md.rowsOf(m, k).map((r) => ({ label: r.l, amount: r.a, paid: r.c })) })),
    installments_this_month: md.instLines(m).map((l) => ({ plan: l.name, amount: Math.round(l.amount), paid: l.paid })),
    series_24_months: d.order.map((mm, k) => ({
      m: mm,
      income: Math.round(ser[k].income),
      out: Math.round(ser[k].out),
      net: Math.round(ser[k].net),
      balance: Math.round(ser[k].leftover),
      planned_income: Math.round(md.plannedIncome(mm)),
      planned_out: Math.round(md.plannedOut(mm)),
    })),
    plans: d.plans.map((p) => {
      const c = md.planCalc(p);
      return { name: p.name, group: p.group, monthly: Math.round(c.monthly), paid_months: c.paidCount, months: c.count, remaining: Math.round(c.remaining), starts: p.start, ends: c.end };
    }),
    debts: d.people.map((p) => {
      const paid = md.paidPerson(p.name);
      return { name: p.name, original: p.original, paid: Math.round(paid), remaining: Math.round(Math.max(p.original - paid, 0)) };
    }),
    cafe_profit_recent: d.order.slice(Math.max(0, ci - 5), ci + 1).map((mm) => {
      const cp = md.cafeProfit(mm);
      return { m: mm, sales: Math.round(cp.inc), purchases: Math.round(cp.exp), fixed: Math.round(cp.rec), profit: Math.round(cp.profit) };
    }),
  };
  return { content: JSON.stringify(data) };
}

async function addLine(i: Json, ctx: ToolContext): Promise<ToolOutcome> {
  const month = monthArg(i.month);
  if (!ORDER.includes(month)) return fail(`${month} is outside the plan (${ORDER[0]} … ${ORDER[ORDER.length - 1]}).`);
  if (!isSec(i.section)) return fail(`Unknown section. Use one of: ${MAN.join(", ")}.`);
  const section = i.section;
  const label = String(i.label ?? "").trim().slice(0, 120);
  if (!label) return fail("A label is required.");
  const amount = num(i.amount);
  if (!Number.isFinite(amount) || amount < 0) return fail("A valid amount is required.");
  const checked = i.paid !== false;
  const loc = await locationId();
  if (!loc) return fail("No location.");
  await backupFinance("ai");
  const db = createServiceClient();
  const { data: last } = await db.from("finance_budget_lines").select("position").eq("location_id", loc).eq("month", month).order("position", { ascending: false }).limit(1);
  const position = (((last ?? [])[0] as { position?: number } | undefined)?.position ?? -1) + 1;
  const values = { location_id: loc, month, section, label, amount, checked, note: null, position };
  const { data: row, error } = await db.from("finance_budget_lines").insert(values).select("id").single();
  if (error || !row) return fail(error?.message ?? "Could not add the line.");
  const id = (row as { id: string }).id;
  await record(ctx, {
    title: `${label} — ${fmt(amount)} د.إ`,
    detail: `${TITLE[section]} · ${mLabel(month)} · ${checked ? (section === "income" ? "مستلم" : "مدفوع") : "مخطط (غير مدفوع)"}`,
    ops: [{ op: "insert", table: "finance_budget_lines", id, values }],
    before: [null],
    table: "finance_budget_lines",
    entityId: id,
  });
  return { content: `Added to ${month} / ${section}: "${label}" ${amount} (${checked ? "paid" : "planned"}).` };
}

async function updateLine(i: Json, ctx: ToolContext): Promise<ToolOutcome> {
  const month = monthArg(i.month);
  if (!isSec(i.section)) return fail(`Unknown section. Use one of: ${MAN.join(", ")}.`);
  const loc = await locationId();
  if (!loc) return fail("No location.");
  const { hit, labels } = await findLine(loc, month, i.section, String(i.label ?? ""));
  if (!hit) return fail(`No line like "${i.label}" in ${month} / ${i.section}. Lines there: ${labels.join(" | ") || "(none)"}.`);
  const changes: Json = {};
  if (typeof i.new_label === "string" && i.new_label.trim()) changes.label = i.new_label.trim().slice(0, 120);
  if (i.new_amount !== undefined && i.new_amount !== null) {
    const a = num(i.new_amount);
    if (!Number.isFinite(a) || a < 0) return fail("Bad amount.");
    changes.amount = a;
  }
  if (i.new_section !== undefined && i.new_section !== null) {
    if (!isSec(i.new_section)) return fail("Bad section.");
    changes.section = i.new_section;
  }
  if (typeof i.paid === "boolean") changes.checked = i.paid;
  if (!Object.keys(changes).length) return fail("Nothing to change.");
  const before: Json = {};
  for (const k of Object.keys(changes)) before[k] = hit[k];
  await backupFinance("ai");
  const id = String(hit.id);
  const { error } = await createServiceClient().from("finance_budget_lines").update(changes).eq("id", id);
  if (error) return fail(error.message);
  const what = [
    changes.label !== undefined ? `الاسم ← ${changes.label}` : null,
    changes.amount !== undefined ? `المبلغ ${fmt(Number(hit.amount))} ← ${fmt(Number(changes.amount))}` : null,
    changes.section !== undefined ? `نُقل إلى ${TITLE[String(changes.section)]}` : null,
    changes.checked !== undefined ? (changes.checked ? "مدفوع" : "غير مدفوع") : null,
  ].filter(Boolean).join(" · ");
  await record(ctx, { title: `تعديل: ${hit.label}`, detail: `${mLabel(month)} · ${what}`, ops: [{ op: "update", table: "finance_budget_lines", id, changes }], before: [before], table: "finance_budget_lines", entityId: id });
  return { content: `Updated "${hit.label}" in ${month}: ${JSON.stringify(changes)}.` };
}

async function deleteLine(i: Json, ctx: ToolContext): Promise<ToolOutcome> {
  const month = monthArg(i.month);
  if (!isSec(i.section)) return fail(`Unknown section. Use one of: ${MAN.join(", ")}.`);
  const loc = await locationId();
  if (!loc) return fail("No location.");
  const { hit, labels } = await findLine(loc, month, i.section, String(i.label ?? ""));
  if (!hit) return fail(`No line like "${i.label}" in ${month} / ${i.section}. Lines there: ${labels.join(" | ") || "(none)"}.`);
  await backupFinance("ai");
  const id = String(hit.id);
  const { error } = await createServiceClient().from("finance_budget_lines").delete().eq("id", id);
  if (error) return fail(error.message);
  await record(ctx, { title: `حذف: ${hit.label} — ${fmt(Number(hit.amount))} د.إ`, detail: `${TITLE[i.section]} · ${mLabel(month)}`, ops: [{ op: "delete", table: "finance_budget_lines", id }], before: [hit], table: "finance_budget_lines", entityId: id });
  return { content: `Deleted "${hit.label}" from ${month}.` };
}

async function installmentPaid(i: Json, ctx: ToolContext): Promise<ToolOutcome> {
  const month = monthArg(i.month);
  const loc = await locationId();
  if (!loc) return fail("No location.");
  const { data } = await createServiceClient().from("finance_installments").select("*").eq("location_id", loc).order("position");
  const plans = (data ?? []) as Json[];
  const want = norm(i.plan);
  const plan = plans.find((p) => norm(p.name) === want) ?? plans.find((p) => want && norm(p.name).includes(want)) ?? plans.find((p) => norm(p.name).length > 1 && want.includes(norm(p.name)));
  if (!plan) return fail(`No plan like "${i.plan}". Plans: ${plans.map((p) => String(p.name)).join(" | ") || "(none)"}.`);
  const a = ORDER.indexOf(String(plan.start_month ?? ""));
  const xi = ORDER.indexOf(month);
  const count = Math.max(Number(plan.installments_count) || 1, 1);
  if (a < 0 || xi < a || xi >= a + count) return fail(`"${plan.name}" has no installment due in ${month} (starts ${plan.start_month}, ${count} months).`);
  const k = xi - a;
  const paidCount = Math.max(Number(plan.paid_count) || 0, 0);
  const want_paid = i.paid !== false;
  const next = want_paid ? Math.max(paidCount, k + 1) : Math.min(paidCount, k);
  if (next === paidCount) return { content: `"${plan.name}" for ${month} is already ${want_paid ? "paid" : "unpaid"}.` };
  await backupFinance("ai");
  const id = String(plan.id);
  const { error } = await createServiceClient().from("finance_installments").update({ paid_count: next }).eq("id", id);
  if (error) return fail(error.message);
  const monthly = (Number(plan.total) || 0) / count;
  await record(ctx, {
    title: `قسط ${plan.name} — ${mLabel(month)} ${want_paid ? "مدفوع" : "غير مدفوع"}`,
    detail: `${fmt(monthly)} د.إ · الأقساط المدفوعة ${paidCount} ← ${next} من ${count}`,
    ops: [{ op: "update", table: "finance_installments", id, changes: { paid_count: next } }],
    before: [{ paid_count: paidCount }],
    table: "finance_installments",
    entityId: id,
  });
  return { content: `Marked "${plan.name}" ${want_paid ? "paid" : "unpaid"} for ${month} (paid ${next}/${count}).` };
}

export async function executeFinanceTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const i = (input ?? {}) as Json;
  try {
    switch (name) {
      case "finance_summary":
        return await summary(i);
      case "finance_add_line":
        return await addLine(i, ctx);
      case "finance_update_line":
        return await updateLine(i, ctx);
      case "finance_delete_line":
        return await deleteLine(i, ctx);
      case "finance_installment_paid":
        return await installmentPaid(i, ctx);
      case "query_db":
      case "show_chart":
      case "show_table":
      case "show_stats":
      case "suggest_followups":
        return await executeTool(name, input, ctx);
      default:
        return fail(`Unknown tool ${name}.`);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

export async function buildFinancePrompt(): Promise<string> {
  const cur = currentPlanMonth();
  return `أنت "المساعد المالي" داخل تطبيق Strow — تساعد عيد في ميزانيته الشخصية (خاصة به، منفصلة تمامًا عن حسابات الكافيه).
اليوم ${todayDubai()} (توقيت دبي). الشهر الحالي: ${cur} (${mLabel(cur)}). الخطة تغطي 24 شهرًا من ${mLabel(ORDER[0])} إلى ${mLabel(ORDER[ORDER.length - 1])}. العملة درهم (د.إ).

كيف تجاوب
- لا تخمّن أي رقم: ابدأ بـ finance_summary (نفس حسابات صفحة المالية بالضبط)، واستخدم query_db للأسئلة الأعمق.
- أجب بلغة المستخدم (عربي خليجي بسيط إذا كتب بالعربي)، باختصار وبأرقام واضحة.
- للتحليل ارسم: show_chart للاتجاهات والمقارنات والتوزيع (hbar للترتيب، donut للتوزيع، line أو area للاتجاه، bar للمقارنة)، show_stats لـ 2–4 أرقام رئيسية، show_table للقوائم. ثم 2–4 جمل خلاصة ونصيحة عملية واحدة. القيم أرقام صافية و unit = "AED".
- الرسم يظهر فقط إذا استدعيت أداة show_chart / show_table / show_stats فعلاً. لا تكتب بيانات الرسم كنص أبدًا، ولا تنسخ أسطر "(note: earlier I called …)" أو "[Chart shown: …]" من الرسائل السابقة — هذي سجلات لأدوات سابقة. إذا طلب نفس الرسم أو "نفس الشي مع …" استدعِ show_chart من جديد.
- اختم دائمًا بـ suggest_followups (2–3 أسئلة قصيرة بالعربي).

كيف تسجّل وتعدّل
- "دفعت / حوّلت / سددت / صرفت" = بند مدفوع (paid=true) في الشهر المذكور؛ الافتراضي هو الشهر الحالي، و"الشهر الجاي" هو التالي. خطة أو ميزانية مستقبلية = paid=false.
- اختر الباب الأنسب: ${SEC_GUIDE}. إذا كان الباب غير واضح اختر الأقرب وقل ذلك في سطر.
- الأقساط لا تُضاف كبند: استخدم finance_installment_paid.
- سداد دين لشخص: finance_add_line بالباب debt و label = اسم الشخص كما في قائمة الديون بالضبط.
- لا تكرر بندًا موجودًا بنفس الاسم والمبلغ في نفس الشهر — نبّه واسأل.
- كل تعديل له زر تراجع. بعد التعديل أكّد في سطر واحد مع رقم محدّث (مثل: باقي تدفعه هذا الشهر).
- لا تعدّل أي شيء في بيانات الكافيه؛ أرباح الكافيه في الملخص للاطلاع فقط.
- عند تنفيذ عدة بنود، نفّذها واحدًا واحدًا ثم لخّص.

الجداول (للاستعلام فقط عبر query_db): finance_budget_lines(month, section, label, amount, checked, position) — checked = مدفوع/مستلم؛ finance_installments(name, group_name, total, installments_count, start_month, paid_count)؛ finance_people(name, original_amount).`;
}
