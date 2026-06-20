import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner-session";

export const dynamic = "force-dynamic";

const ALL: string[] = [];
for (const y of [2026, 2027, 2028]) for (let m = 1; m <= 12; m++) ALL.push(`${y}-${String(m).padStart(2, "0")}`);
const ORDER = ALL.filter((k) => k >= "2026-06" && k <= "2028-05");
const OUT = ["expense", "wife", "bills", "debt", "personal", "reserve"];

const SYS = `أنت مساعد عيد المالي داخل تطبيق Strow. أجب بنفس لغة المستخدم (عربي أو إنجليزي)، باختصار وود، مستندًا فقط إلى DATA (المبالغ بالدرهم د.إ). المستخدم قد يسأل سؤالاً أو يطلب تسجيل عملية مالية.
أعد فقط كائن JSON بدون أي نص أو علامات، بهذا الشكل:
{"reply":"<الرد الظاهر للمستخدم>","action": null | {"type":"add_line","section":"income|expense|wife|bills|debt|personal|reserve","label":"...","amount":<رقم>,"month":"YYYY-MM"} | {"type":"installment_paid","plan":"<اسم الخطة>","paid":<true|false>,"month":"YYYY-MM"}}
القواعد: الشهر الافتراضي = CURRENT_MONTH ما لم يذكر المستخدم شهرًا آخر. المصروف العام → section expense؛ الفواتير (كهرباء/إنترنت/ماء) → bills؛ سداد دين لشخص → section debt و label=اسم الشخص؛ دفع قسط → installment_paid مع اسم الخطة الأقرب. عند وجود action اجعل reply تأكيدًا قصيرًا بلغة المستخدم يذكر المبلغ والشهر. للأسئلة فقط action=null. اجعل reply أقل من 320 حرفًا.`;

export async function POST(req: Request) {
  const sess = await getOwnerSession();
  if (!sess) return NextResponse.json({ error: "unauth" }, { status: 401 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ reply: "المساعد غير مفعّل (مفتاح API غير موجود).", action: null });

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const message = String(body.message || "").slice(0, 1000);
  const cur = /^\d{4}-\d{2}$/.test(body.month) ? body.month : ORDER[0];
  if (!message.trim()) return NextResponse.json({ reply: "اكتب سؤالك أو أمرك.", action: null });

  const supabase = createServiceClient();
  const [linesRes, instRes, peopleRes, eliRes] = await Promise.all([
    supabase.from("finance_budget_lines").select("month,section,label,amount,checked"),
    supabase.from("finance_installments").select("*").order("position", { ascending: true }),
    supabase.from("finance_people").select("*").order("position", { ascending: true }),
    supabase.from("expense_line_items").select("description,quantity,line_total"),
  ]);

  const lines = (linesRes.data ?? []) as any[];
  const get = (m: string, sec: string) => lines.filter((r) => r.month === m && r.section === sec);
  const sumChk = (m: string, sec: string) => get(m, sec).filter((r) => r.checked).reduce((a, r) => a + (+r.amount || 0), 0);
  const plans = ((instRes.data ?? []) as any[]).map((it) => { const count = Math.max(+it.installments_count || 1, 1); const monthly = count > 0 ? (+it.total || 0) / count : 0; const si = ORDER.indexOf(it.start_month); const end = si >= 0 ? ORDER[Math.min(si + count - 1, ORDER.length - 1)] : it.start_month; return { name: it.name || "", group: it.group_name || "أخرى", monthly, count, start: it.start_month || ORDER[0], end, paid: Math.max(+it.paid_count || 0, 0) }; });
  const instPaidMonth = (m: string) => { let s = 0; const xi = ORDER.indexOf(m); plans.forEach((p) => { const a = ORDER.indexOf(p.start); if (a >= 0 && xi >= a && (xi - a) < p.count && (xi - a) < p.paid) s += p.monthly; }); return s; };
  const series: any[] = []; let cum = 0;
  for (const m of ORDER) { const income = sumChk(m, "income"); const out = OUT.reduce((x, s) => x + sumChk(m, s), 0) + instPaidMonth(m); const net = income - out; cum += net; series.push({ m, income: Math.round(income), out: Math.round(out), net: Math.round(net), leftover: Math.round(cum) }); }
  const people = ((peopleRes.data ?? []) as any[]).map((p) => { const name = p.name || ""; const paid = name.trim() === "" ? 0 : ORDER.reduce((a, m) => a + get(m, "debt").filter((r) => r.checked && String(r.label || "").includes(name)).reduce((s, r) => s + (+r.amount || 0), 0), 0); const original = +p.original_amount || 0; return { name, original, paid: Math.round(paid), remaining: Math.round(original - paid) }; });
  const planView = plans.map((p) => ({ name: p.name, group: p.group, monthly: Math.round(p.monthly), start: p.start, end: p.end, count: p.count, paid_months: p.paid, paid: Math.round(p.monthly * p.paid), remaining: Math.round(p.monthly * (p.count - p.paid)) }));
  const curLines: any = {};
  ["income", "expense", "wife", "bills", "debt", "personal", "reserve"].forEach((sec) => { const rows = get(cur, sec).map((r) => ({ label: r.label || "", amount: +r.amount || 0, checked: !!r.checked })); if (rows.length) curLines[sec] = rows; });
  const items: Record<string, any> = {};
  for (const r of (eliRes.data ?? []) as any[]) { const k = (r.description || "").trim() || "(غير مسمى)"; const it = items[k] || (items[k] = { item: k, times: 0, spend: 0, qty: 0 }); it.times += 1; it.spend += +r.line_total || 0; it.qty += +r.quantity || 0; }
  const top_items = Object.values(items).sort((a: any, b: any) => b.spend - a.spend).slice(0, 8).map((x: any) => ({ item: x.item, times: x.times, spend: Math.round(x.spend), qty: Math.round(x.qty) }));
  const ctx = { months_order: ORDER, series, current_month: cur, current_month_lines: curLines, installment_plans: planView, debts: people, cafe_top_items: top_items, cafe_note: "أرقام الكافيه مرجعية فقط وغير محتسبة في الميزانية الشخصية" };

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      system: SYS,
      messages: [{ role: "user", content: `DATA:\n${JSON.stringify(ctx)}\n\nCURRENT_MONTH: ${cur}\n\nUSER: ${message}` }],
    });
    const tb: any = resp.content.find((b: any) => b.type === "text");
    let out: any = { reply: "ما قدرت أفهم، جرّب صياغة ثانية.", action: null };
    if (tb && tb.text) {
      const cleaned = tb.text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
      try { const j = JSON.parse(cleaned); out = { reply: String(j.reply || ""), action: j.action || null }; }
      catch { out = { reply: tb.text.trim().slice(0, 500), action: null }; }
    }
    if (out.action) {
      const a = out.action;
      if (a.type === "add_line") {
        const secs = ["income", "expense", "wife", "bills", "debt", "personal", "reserve"];
        if (!secs.includes(a.section) || !(Number(a.amount) > 0)) out.action = null;
        else { a.month = /^\d{4}-\d{2}$/.test(a.month) ? a.month : cur; a.amount = Number(a.amount); a.label = String(a.label || "بند"); }
      } else if (a.type === "installment_paid") {
        if (!a.plan) out.action = null;
        else { a.month = /^\d{4}-\d{2}$/.test(a.month) ? a.month : cur; a.paid = a.paid !== false; }
      } else out.action = null;
    }
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ reply: "تعذّر الاتصال بالمساعد الآن، حاول لاحقًا.", action: null });
  }
}
