"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useTransition } from "react";
import { saveBudget, savePeople, saveInstallments } from "@/app/owner/finance/actions";

const CSS = `
.sf{--bg:#f4f1ea;--panel:#fff;--ink:#2b2b33;--muted:#8a8a96;--line:#e7e1d5;--income:#2f8f83;--expense:#9d3b4a;--wife:#7a4458;--bills:#5b7da6;--install:#5a52c9;--debt:#c0556a;--personal:#b8862b;--reserve:#5e8c64;--pos:#1f9d57;--neg:#c0392b;color:var(--ink);font-family:"Segoe UI","Tahoma",system-ui,Arial,sans-serif}
.sf *{box-sizing:border-box}
.sf .tabnum{font-variant-numeric:tabular-nums}
.sf .msel{position:sticky;top:0;z-index:20;background:var(--bg);padding:8px 0 6px}
.sf .mrow{display:flex;align-items:center;gap:8px}
.sf .navbtn{flex:0 0 auto;width:38px;height:38px;border:0;border-radius:12px;background:#5b3f2c;color:#fff;font-size:20px;cursor:pointer}
.sf .strip{display:flex;gap:7px;overflow-x:auto;padding:4px 2px}
.sf .chip{flex:0 0 auto;min-width:94px;background:var(--panel);border:2px solid var(--line);border-radius:12px;padding:7px 10px;cursor:pointer;text-align:center}
.sf .chip.on{border-color:#5b3f2c;box-shadow:0 4px 14px rgba(91,63,44,.18)}
.sf .chip .cn{font-size:12px;font-weight:800;color:#4a4a52}.sf .chip .cb{font-size:13px;font-weight:800;margin-top:3px}.sf .chip .ct{font-size:9px;color:var(--muted)}
.sf .tabs{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}
.sf .tab{border:1px solid var(--line);background:#fff;color:#6a6a72;border-radius:22px;padding:9px 15px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit}
.sf .tab.on{background:#5b3f2c;border-color:#5b3f2c;color:#fff}
.sf .hero{background:linear-gradient(135deg,#6f4e37,#9c7a5c);color:#fff;border-radius:20px;padding:18px 20px;margin-bottom:14px}
.sf .hero .lab{font-size:13px;opacity:.9}.sf .hero .big{font-size:34px;font-weight:900;margin-top:2px}.sf .hero .meta{font-size:12.5px;opacity:.92;margin-top:6px}
.sf .grid{display:grid;gap:11px}.sf .k4{grid-template-columns:repeat(4,1fr)}.sf .k3{grid-template-columns:repeat(3,1fr)}.sf .k2{grid-template-columns:repeat(2,1fr)}
.sf .kpi{background:var(--panel);border:1px solid var(--line);border-radius:15px;padding:13px;border-top:4px solid var(--line)}
.sf .kpi .l{font-size:11.5px;color:var(--muted)}.sf .kpi .v{font-size:19px;font-weight:800;margin-top:4px}.sf .kpi .m{font-size:10.5px;color:var(--muted);margin-top:3px}
.sf .kpi.income{border-top-color:var(--income)}.sf .kpi.out{border-top-color:var(--expense)}.sf .kpi.net{border-top-color:#5b3f2c}.sf .kpi.cafe{border-top-color:#b08d3c}
.sf .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:15px;margin-top:14px}
.sf .card h3{font-size:14.5px;font-weight:800;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center}
.sf .chartbox{position:relative;height:280px}.sf .chartbox.sm{height:230px}
.sf .hint{font-size:11.5px;color:var(--muted);margin-top:8px;line-height:1.7}
.sf .sec{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-top:13px}
.sf .sec>h3{color:#fff;padding:12px 15px;font-size:14px;font-weight:800;display:flex;justify-content:space-between;align-items:center;gap:8px;margin:0}
.sf .stot{font-size:12.5px;font-weight:800;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:8px}
.sf .allbtn{border:0;background:rgba(255,255,255,.22);color:#fff;border-radius:8px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}
.sf .rowL{display:flex;align-items:center;gap:9px;padding:9px 13px;border-top:1px solid #f2eee6}
.sf .rowL .chk{flex:0 0 auto;width:34px;height:34px;border-radius:10px;border:2px solid #d6cdbb;background:#fff;cursor:pointer;font-size:17px}
.sf .rowL .chk.on{background:#e7f5ec;border-color:var(--pos)}
.sf .rowL .nm{flex:1;border:0;background:transparent;font-family:inherit;font-size:14px;color:var(--ink);padding:4px;min-width:60px}
.sf .rowL .ro{flex:1;font-size:14px;padding:4px}
.sf .rowL .amt{width:100px;text-align:left;border:1px solid #e2dccd;border-radius:9px;padding:7px;font-family:inherit;font-size:14px;background:#fffdf8;color:#138a5a}
.sf .rowL .amt.neg{color:var(--neg)}.sf .rowL .amt.ro2{background:#f3efe7;color:#5a52c9;border-style:dashed}
.sf .rowL.off{opacity:.45}.sf .rowL.off .amt{text-decoration:line-through}
.sf .rowL .del{flex:0 0 auto;border:0;background:transparent;color:#cdbcbc;font-size:17px;cursor:pointer}
.sf .addb{margin:10px 13px;border:1px dashed #cabfa9;background:#f7f3ea;border-radius:10px;padding:8px 12px;cursor:pointer;font-family:inherit;color:#6a5a44;font-size:13px}
.sf .addrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 13px;border-top:1px dashed #e7d9c9;background:#faf7f1}
.sf .summbar{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;text-align:center}
.sf .summbar .b{background:#faf7f1;border-radius:11px;padding:9px}.sf .summbar .b .t{font-size:10px;color:var(--muted)}.sf .summbar .b .v{font-size:14px;font-weight:800;margin-top:3px}
.sf .prog{height:9px;background:#efeadf;border-radius:7px;overflow:hidden;margin-top:6px}.sf .prog>i{display:block;height:100%;border-radius:7px}
.sf .tline{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;margin-bottom:3px;flex-wrap:wrap}
.sf .pill{font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px}.sf .pill.ok{background:#e3f5ea;color:#1f9d57}.sf .pill.due{background:#fdeccf;color:#9a6a13}
.sf .itemrow{display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid #f2eee6;font-size:13px}
.sf .btn{border:0;border-radius:11px;padding:9px 15px;font-family:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.sf .btn.dark{background:#5b3f2c;color:#fff}.sf .btn.soft{background:#efe8db;color:#5b4a36}
.sf .inpt{border:1px solid #e2dccd;border-radius:10px;padding:8px;font-family:inherit;font-size:14px;background:#fff}
.sf .asst{background:linear-gradient(135deg,#23303a,#33424f);color:#fff;border-radius:18px;padding:15px;margin-top:14px}
.sf .asst h3{color:#fff;font-size:15px;font-weight:800;margin:0 0 4px}.sf .asst .sub{font-size:11.5px;opacity:.8;margin-bottom:10px}
.sf .msgs{max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:9px;padding:4px 2px}
.sf .msg{max-width:88%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.7;white-space:pre-wrap}
.sf .msg.bot{background:rgba(255,255,255,.12);align-self:flex-start}.sf .msg.me{background:#cfa15f;color:#22160a;align-self:flex-end;font-weight:600}
.sf .chips{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}
.sf .qchip{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:18px;padding:7px 11px;font-size:12px;cursor:pointer;font-family:inherit}
.sf .askrow{display:flex;gap:8px;margin-top:6px}.sf .askrow input{flex:1;border:0;border-radius:12px;padding:11px 13px;font-family:inherit;font-size:14px;background:#fff;color:#222}
.sf .askrow button{border:0;border-radius:12px;padding:0 18px;background:#cfa15f;color:#22160a;font-weight:800;cursor:pointer;font-family:inherit}
.sf .tbl{width:100%;border-collapse:collapse;font-size:12.5px}.sf .tbl th{background:#f5f1e9;color:#6a6a72;padding:9px;text-align:right;font-weight:700}
.sf .tbl td{padding:7px 9px;border-top:1px solid #f1ede4}.sf .tbl tr.cur{background:#fbf4e7}
.sf .tbl input,.sf .tbl select{border:1px solid #e2dccd;border-radius:8px;padding:6px;font-family:inherit;font-size:12.5px;background:#fff;width:100%}
.sf .tbl .lnk{background:0;border:0;color:#5b3f2c;font-weight:700;cursor:pointer;font-family:inherit;font-size:12.5px}
.sf .scrollx{overflow-x:auto}
.sf .save{position:fixed;inset-block-end:18px;inset-inline-start:50%;transform:translateX(50%);background:#23303a;color:#fff;padding:9px 16px;border-radius:12px;font-size:12.5px;opacity:0;transition:.25s;z-index:60;pointer-events:none}
.sf .save.show{opacity:1}
@media(max-width:720px){.sf .k4,.sf .k3{grid-template-columns:repeat(2,1fr)}.sf .summbar{grid-template-columns:repeat(3,1fr)}}
`;

export function FinanceApp({ initial }: { initial: any }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const root = ref.current as any;
    if (!root) return;
    const st: any = {
      months: JSON.parse(JSON.stringify(initial.months)),
      order: initial.order.slice(),
      plans: initial.plans.map((p: any) => ({ ...p, monthly: p.count > 0 ? p.total / p.count : 0 })),
      people: initial.people.map((p: any) => ({ ...p })),
      cafe: initial.cafe,
      cur: initial.current,
      tab: "overview",
      charts: {},
      msgs: [{ who: "bot", t: "أهلاً 👋 اسألني أو نفّذ: «صرفت 500 لتجهيز فيزا»، «سددت 1000 لشوكت»، «متى ينتهي قسط Tajer؟»، «كم يتبقّى لو دفعت كل الأقساط؟»، «أكثر صنف شراءً؟»" }],
    };
    const AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    const mLabel = (k: string) => { const a = k.split("-").map(Number); return AR[a[1] - 1] + " " + a[0]; };
    const mShort = (k: string) => AR[Number(k.split("-")[1]) - 1];
    const fmt = (n: number) => (n < 0 ? "-" : "") + "د.إ " + Math.abs(Math.round(n)).toLocaleString("en-US");
    const fmt2 = (n: number) => (n < 0 ? "-" : "") + "د.إ " + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const norm = (s: string) => (s || "").replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").toLowerCase();
    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const ORDER = st.order;
    const MAN = ["income","expense","wife","bills","debt","personal","reserve"];
    const OUT = ["expense","wife","bills","debt","personal","reserve"];
    const SECT = [
      { k: "income", t: "الدخل", c: "var(--income)", icon: "💰" },
      { k: "expense", t: "المصاريف", c: "var(--expense)", icon: "🏠" },
      { k: "wife", t: "تحويل الزوجة (راعية عطوة)", c: "var(--wife)", icon: "💝" },
      { k: "bills", t: "الفواتير", c: "var(--bills)", icon: "💡" },
      { k: "installment", t: "أقساط هذا الشهر", c: "var(--install)", icon: "💳" },
      { k: "debt", t: "سداد الديون", c: "var(--debt)", icon: "🤝" },
      { k: "personal", t: "مصروفي الشخصي", c: "var(--personal)", icon: "🧍" },
      { k: "reserve", t: "الاحتياطي / الطوارئ", c: "var(--reserve)", icon: "🛟" },
    ];
    const rowsOf = (m: string, s: string) => (st.months[m] && st.months[m][s]) ? st.months[m][s] : [];
    const sumChk = (m: string, s: string) => rowsOf(m, s).filter((r: any) => r.c).reduce((a: number, r: any) => a + (+r.a || 0), 0);
    const sumAll = (m: string, s: string) => rowsOf(m, s).reduce((a: number, r: any) => a + (+r.a || 0), 0);
    const planEnd = (p: any) => { const i = ORDER.indexOf(p.start); return i < 0 ? p.start : ORDER[Math.min(i + Math.max(p.count - 1, 0), ORDER.length - 1)]; };
    const instLines = (m: string) => { const out: any[] = []; const xi = ORDER.indexOf(m); st.plans.forEach((p: any, pi: number) => { const a = ORDER.indexOf(p.start), b = ORDER.indexOf(planEnd(p)); if (a >= 0 && xi >= a && xi <= b) out.push({ pi, name: p.name, group: p.group, amount: +p.monthly || 0, paid: (xi - a) < (+p.paid || 0) }); }); return out; };
    const instPaid = (m: string) => instLines(m).filter((l) => l.paid).reduce((a, l) => a + l.amount, 0);
    const instPlanned = (m: string) => instLines(m).reduce((a, l) => a + l.amount, 0);
    const debtLines = (m: string) => rowsOf(m, "debt").map((r: any, i: number) => ({ i, l: r.l, a: +r.a || 0, c: !!r.c }));
    const incomeOf = (m: string) => sumChk(m, "income");
    const outOf = (m: string) => OUT.reduce((a, s) => a + sumChk(m, s), 0) + instPaid(m);
    const series = () => { let cum = 0; return ORDER.map((m: string) => { const income = incomeOf(m), out = outOf(m), net = income - out, opening = cum; cum += net; return { m, income, out, net, opening, leftover: cum }; }); };
    const monthInfo = (m: string) => series().find((x: any) => x.m === m);
    const cafeProfit = (m: string) => { const inc = st.cafe.income_by_month[m] || 0, exp = st.cafe.expense_by_month[m] || 0; return { inc, exp, rec: st.cafe.recurring, profit: inc - exp - st.cafe.recurring }; };
    const planCalc = (p: any) => { const count = Math.max(+p.count || 0, 0), monthly = +p.monthly || 0, paid = Math.min(Math.max(+p.paid || 0, 0), count); return { count, monthly, total: monthly * count, paid: monthly * paid, remaining: monthly * (count - paid), paidCount: paid, remCount: count - paid, pct: count > 0 ? (paid / count) * 100 : 0, end: mLabel(planEnd(p)) }; };
    const paidPerson = (name: string) => name.trim() === "" ? 0 : ORDER.reduce((a: number, m: string) => a + rowsOf(m, "debt").filter((r: any) => r.c && (r.l || "").includes(name)).reduce((s: number, r: any) => s + (+r.a || 0), 0), 0);
    const plannedOut = (m: string) => ["expense","wife","bills","debt","personal","reserve"].reduce((a, s) => a + sumAll(m, s), 0) + instPlanned(m);

    let saveTimer: any = null;
    const flash = (t: string) => { const f = root.querySelector(".save"); if (!f) return; f.textContent = t; f.classList.add("show"); clearTimeout(saveTimer); saveTimer = setTimeout(() => f.classList.remove("show"), 1500); };
    const toLines = (m: string) => { const out: any[] = []; MAN.forEach((sec) => rowsOf(m, sec).forEach((r: any) => out.push({ section: sec, label: r.l, amount: +r.a || 0, checked: !!r.c }))); return out; };
    const persistMonth = (m: string) => { flash("💾 يحفظ…"); startTransition(() => { (saveBudget as any)(m, toLines(m)).then(() => flash("✓ محفوظ سحابيًا")).catch(() => flash("⚠️ خطأ بالحفظ")); }); };
    const persistPlans = () => { flash("💾 يحفظ…"); startTransition(() => { (saveInstallments as any)(st.plans.map((p: any) => ({ name: p.name, group_name: p.group, total: (+p.monthly || 0) * (+p.count || 0), installments_count: p.count, start_month: p.start, paid_count: p.paid }))).then(() => flash("✓ محفوظ سحابيًا")).catch(() => flash("⚠️ خطأ بالحفظ")); }); };
    const persistPeople = () => { flash("💾 يحفظ…"); startTransition(() => { (savePeople as any)(st.people.map((p: any) => ({ name: p.name, original_amount: p.original, payments: [] }))).then(() => flash("✓ محفوظ سحابيًا")).catch(() => flash("⚠️ خطأ بالحفظ")); }); };

    const assistantHTML = () => `<div class="asst"><h3>🤖 المساعد المالي</h3><div class="sub">يفهم بياناتك الحقيقية وينفّذ ويحفظ سحابيًا.</div>
      <div class="msgs" id="sfMsgs">${st.msgs.map((m: any) => `<div class="msg ${m.who === "me" ? "me" : "bot"}">${m.t}</div>`).join("")}</div>
      <div class="chips"><button class="qchip" data-q="صرفت 500 لتجهيز فيزا">＋ صرفت 500 لتجهيز فيزا</button><button class="qchip" data-q="سددت 1000 لشوكت">🤝 سددت 1000 لشوكت</button><button class="qchip" data-q="متى ينتهي قسط Tajer؟">⏳ نهاية قسط</button><button class="qchip" data-q="كم يتبقى لو دفعت كل الأقساط؟">💳 بعد كل الأقساط</button><button class="qchip" data-q="أكثر صنف شراء؟">☕ أكثر صنف</button></div>
      <div class="askrow"><input id="sfAsk" placeholder="اكتب سؤالك أو أمرك…"><button id="sfAskBtn">إرسال</button></div></div>`;
    const yearSummaryHTML = () => { const s = series(); const tin = s.reduce((a: number, x: any) => a + x.income, 0), tout = s.reduce((a: number, x: any) => a + x.out, 0), fin = s[s.length - 1].leftover, avg = Math.round((tin - tout) / s.length); const ir = st.plans.reduce((a: number, p: any) => a + planCalc(p).remaining, 0), dr = st.people.reduce((a: number, p: any) => a + ((+p.original || 0) - paidPerson(p.name)), 0);
      return `<div class="card"><h3>ملخص الـ٢٤ شهر</h3><div class="grid k3">
        <div class="kpi income"><div class="l">إجمالي الدخل</div><div class="v tabnum" style="color:var(--income)">${fmt(tin)}</div></div>
        <div class="kpi out"><div class="l">إجمالي الخارج</div><div class="v tabnum" style="color:var(--expense)">${fmt(tout)}</div></div>
        <div class="kpi net"><div class="l">الرصيد التراكمي النهائي</div><div class="v tabnum" style="color:${fin < 0 ? "var(--neg)" : "var(--pos)"}">${fmt(fin)}</div></div>
        <div class="kpi net"><div class="l">متوسط صافي شهري</div><div class="v tabnum" style="color:${avg < 0 ? "var(--neg)" : "var(--pos)"}">${fmt(avg)}</div></div>
        <div class="kpi out"><div class="l">متبقّي الأقساط</div><div class="v tabnum" style="color:var(--neg)">${fmt(ir)}</div></div>
        <div class="kpi out"><div class="l">متبقّي الديون</div><div class="v tabnum" style="color:var(--neg)">${fmt(dr)}</div></div></div></div>`; };
    const top5HTML = () => { const rows: any[] = []; ["expense","wife","bills","debt","personal","reserve"].forEach((k) => rowsOf(st.cur, k).filter((r: any) => r.c).forEach((r: any) => rows.push({ l: r.l || k, a: +r.a || 0 }))); instLines(st.cur).filter((l) => l.paid).forEach((l) => rows.push({ l: "قسط: " + l.name, a: l.amount })); rows.sort((a, b) => b.a - a.a); const top = rows.slice(0, 5); if (!top.length) return `<div class="hint">لا مصاريف محتسبة هذا الشهر.</div>`; const mx = top[0].a || 1; return top.map((r) => `<div style="margin-bottom:8px"><div class="tline"><span>${esc(r.l)}</span><span class="tabnum" style="color:var(--muted)">${fmt(r.a)}</span></div><div class="prog"><i style="width:${(r.a / mx * 100).toFixed(0)}%;background:var(--expense)"></i></div></div>`).join(""); };
    const upcomingHTML = () => { const i = ORDER.indexOf(st.cur); let rows = "", any = false; for (let k = 1; k <= 3; k++) { const m = ORDER[i + k]; if (!m) break; any = true; rows += `<tr><td>${mLabel(m)}</td><td class="tabnum" style="color:var(--install)">${fmt(instPlanned(m))}</td><td class="tabnum">${fmt(sumAll(m, "bills"))}</td><td class="tabnum" style="font-weight:700">${fmt(plannedOut(m))}</td></tr>`; } if (!any) return `<div class="hint">لا أشهر قادمة.</div>`; return `<table class="tbl"><thead><tr><th>الشهر</th><th>أقساط</th><th>فواتير</th><th>إجمالي متوقع</th></tr></thead><tbody>${rows}</tbody></table>`; };
    const yearCatTableHTML = () => { const cats = [["💰 الدخل","income"],["🏠 المصاريف","expense"],["💝 تحويل الزوجة","wife"],["💡 الفواتير","bills"],["💳 الأقساط","__i"],["🤝 الديون","debt"],["🧍 الشخصي","personal"],["🛟 الاحتياطي","reserve"]]; const tout = series().reduce((a: number, x: any) => a + x.out, 0); let rows = ""; cats.forEach(([t, k]) => { let tot; if (k === "__i") tot = ORDER.reduce((a: number, m: string) => a + instPaid(m), 0); else tot = ORDER.reduce((a: number, m: string) => a + sumChk(m, k as string), 0); const pct = k === "income" ? "—" : (tout > 0 ? (tot / tout * 100).toFixed(0) + "%" : "0%"); rows += `<tr><td>${t}</td><td class="tabnum">${fmt(tot)}</td><td class="tabnum">${fmt(Math.round(tot / 24))}</td><td>${pct}</td></tr>`; }); return `<div class="scrollx"><table class="tbl"><thead><tr><th>الباب</th><th>الإجمالي ٢٤ش</th><th>متوسط شهري</th><th>% من الخارج</th></tr></thead><tbody>${rows}</tbody></table></div>`; };
    const viewOverview = () => { const mi = monthInfo(st.cur), cf = cafeProfit(st.cur), sav = mi.income > 0 ? (mi.net / mi.income * 100) : 0;
      return `<div class="hero"><div class="lab">الرصيد المتبقّي بنهاية ${mLabel(st.cur)} (يُرحّل للشهر التالي)</div><div class="big tabnum">${fmt(mi.leftover)}</div><div class="meta">افتتاحي ${fmt(mi.opening)} · صافي الشهر ${fmt(mi.net)} · ادخار ${sav.toFixed(0)}%</div></div>
      <div class="grid k4">
        <div class="kpi income"><div class="l">📈 الدخل المؤكد</div><div class="v tabnum" style="color:var(--income)">${fmt(mi.income)}</div></div>
        <div class="kpi out"><div class="l">📉 إجمالي الخارج</div><div class="v tabnum" style="color:var(--expense)">${fmt(mi.out)}</div></div>
        <div class="kpi net"><div class="l">💎 صافي الشهر</div><div class="v tabnum" style="color:${mi.net < 0 ? "var(--neg)" : "var(--pos)"}">${fmt(mi.net)}</div></div>
        <div class="kpi cafe"><div class="l">☕ ربح كافيه Qave</div><div class="v tabnum" style="color:${cf.profit < 0 ? "var(--neg)" : "var(--pos)"}">${fmt(cf.profit)}</div><div class="m">مرجعي — غير محتسب</div></div></div>
      ${assistantHTML()}
      <div class="card"><h3>الدخل مقابل الخارج + الرصيد المتراكم (٢٤ شهر)</h3><div class="chartbox"><canvas id="cTrend"></canvas></div></div>
      <div class="grid k2" style="margin-top:14px"><div class="card" style="margin-top:0"><h3>أين يذهب المال — ${mLabel(st.cur)}</h3><div class="chartbox sm"><canvas id="cDonut"></canvas></div></div><div class="card" style="margin-top:0"><h3>نسبة الادخار شهريًا</h3><div class="chartbox sm"><canvas id="cSav"></canvas></div></div></div>
      ${yearSummaryHTML()}
      <div class="card"><h3>توزيع الخارج شهريًا حسب الباب</h3><div class="chartbox"><canvas id="cStack"></canvas></div></div>
      <div class="grid k2" style="margin-top:14px"><div class="card" style="margin-top:0"><h3>أكبر ٥ مصاريف — ${mLabel(st.cur)}</h3>${top5HTML()}</div><div class="card" style="margin-top:0"><h3>التزامات قادمة (٣ أشهر)</h3>${upcomingHTML()}</div></div>
      <div class="card"><h3>ملخص الأبواب خلال ٢٤ شهر</h3>${yearCatTableHTML()}</div>
      <div class="card"><h3>جدول الـ٢٤ شهر</h3><div class="scrollx" style="max-height:340px;overflow-y:auto"><table class="tbl"><thead><tr><th>الشهر</th><th>الدخل</th><th>الخارج</th><th>صافي</th><th>المتراكم</th></tr></thead><tbody>
        ${series().map((s: any) => `<tr class="${s.m === st.cur ? "cur" : ""}"><td><button class="lnk" data-go="${s.m}">${mLabel(s.m)}</button></td><td class="tabnum" style="color:var(--income)">${fmt(s.income)}</td><td class="tabnum" style="color:var(--expense)">${fmt(s.out)}</td><td class="tabnum" style="color:${s.net < 0 ? "var(--neg)" : "inherit"}">${fmt(s.net)}</td><td class="tabnum" style="font-weight:800;color:${s.leftover < 0 ? "var(--neg)" : "var(--pos)"}">${fmt(s.leftover)}</td></tr>`).join("")}
      </tbody></table></div></div>`; };
    const viewAnalytics = () => { const s = series(); const neg = s.filter((x: any) => x.leftover < 0).length, avgSav = s.reduce((a: number, x: any) => a + (x.income > 0 ? x.net / x.income : 0), 0) / s.length * 100; const ir = st.plans.reduce((a: number, p: any) => a + planCalc(p).remaining, 0), dr = st.people.reduce((a: number, p: any) => a + ((+p.original || 0) - paidPerson(p.name)), 0);
      const cat: any = {}; [["المصاريف","expense"],["تحويل الزوجة","wife"],["الفواتير","bills"],["الشخصي","personal"],["الاحتياطي","reserve"]].forEach(([t, k]) => cat[t] = ORDER.reduce((a: number, m: string) => a + sumChk(m, k), 0)); cat["الأقساط"] = ORDER.reduce((a: number, m: string) => a + instPaid(m), 0); cat["الديون"] = ORDER.reduce((a: number, m: string) => a + sumChk(m, "debt"), 0);
      const arr = Object.entries(cat).filter((e: any) => e[1] > 0).sort((a: any, b: any) => b[1] - a[1]) as any[]; const mx = Math.max(1, ...arr.map((c) => c[1]));
      return `<div class="grid k4"><div class="kpi net"><div class="l">متوسط الادخار</div><div class="v tabnum">${avgSav.toFixed(0)}%</div></div><div class="kpi ${neg ? "out" : "income"}"><div class="l">أشهر برصيد سالب</div><div class="v tabnum" style="color:${neg ? "var(--neg)" : "var(--pos)"}">${neg}</div></div><div class="kpi out"><div class="l">متبقّي الأقساط</div><div class="v tabnum" style="color:var(--neg)">${fmt(ir)}</div></div><div class="kpi out"><div class="l">متبقّي الديون</div><div class="v tabnum" style="color:var(--neg)">${fmt(dr)}</div></div></div>
      <div class="card"><h3>أكبر أبواب الصرف خلال ٢٤ شهر</h3>${arr.map((e) => `<div style="margin-bottom:9px"><div class="tline"><span>${e[0]}</span><span class="tabnum" style="color:var(--muted)">${fmt(e[1])}</span></div><div class="prog"><i style="width:${(e[1] / mx * 100).toFixed(0)}%;background:var(--expense)"></i></div></div>`).join("")}</div>
      <div class="grid k2" style="margin-top:14px"><div class="card" style="margin-top:0"><h3>☕ كافيه Qave — دخل/مصاريف</h3><div class="chartbox sm"><canvas id="cCafe"></canvas></div><div class="hint">ثابتة شهرية (رواتب/سكن/إيجار) = ${fmt(st.cafe.recurring)}.</div></div><div class="card" style="margin-top:0"><h3>أكثر الأصناف شراءً</h3><div class="chartbox sm"><canvas id="cItems"></canvas></div></div></div>`; };

    const viewMonth = () => { const mi = monthInfo(st.cur); let h = `<div class="card"><div class="summbar">
      <div class="b"><div class="t">افتتاحي</div><div class="v tabnum">${fmt(mi.opening)}</div></div>
      <div class="b"><div class="t">+ الدخل ✅</div><div class="v tabnum" style="color:var(--income)">${fmt(mi.income)}</div></div>
      <div class="b"><div class="t">− الخارج ✅</div><div class="v tabnum" style="color:var(--expense)">${fmt(mi.out)}</div></div>
      <div class="b"><div class="t">= صافي</div><div class="v tabnum" style="color:${mi.net < 0 ? "var(--neg)" : "var(--pos)"}">${fmt(mi.net)}</div></div>
      <div class="b"><div class="t">المتبقّي</div><div class="v tabnum" style="color:${mi.leftover < 0 ? "var(--neg)" : "var(--pos)"}">${fmt(mi.leftover)}</div></div>
      </div><div class="hint">✅ تُحتسب · ⬜ مخطّط فقط. الأقساط والديون تُحتسب هنا أيضًا في صافي الشهر.</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn soft" id="sfAllOn">✅ تفعيل كل بنود الشهر</button><button class="btn soft" id="sfAllOff">⬜ إلغاء كل بنود الشهر</button></div></div>`;
      SECT.forEach((s: any) => {
        if (s.k === "installment") { const ls = instLines(st.cur), allset = ls.length && ls.every((l) => l.paid);
          h += `<div class="sec"><h3 style="background:${s.c}"><span>${s.icon} ${s.t}</span><span style="display:flex;gap:8px;align-items:center">${ls.length ? `<button class="allbtn" data-all="installment">${allset ? "⬜ إلغاء الكل" : "✅ تحديد الكل"}</button>` : ""}<span class="stot">${fmt(instPaid(st.cur))}</span></span></h3>`;
          if (!ls.length) h += `<div class="hint" style="padding:10px 13px">لا أقساط مستحقّة هذا الشهر. أضِف خطة من تبويب «الأقساط».</div>`;
          ls.forEach((l) => { h += `<div class="rowL ${l.paid ? "" : "off"}" data-kind="inst" data-pi="${l.pi}"><button class="chk ${l.paid ? "on" : ""}" data-act="itog">${l.paid ? "✅" : "⬜"}</button><span class="ro">💳 ${esc(l.name)} <span style="color:var(--muted);font-size:11px">(${esc(l.group)})</span></span><span class="amt ro2">${fmt2(l.amount)}</span></div>`; });
          h += `<div class="hint" style="padding:6px 13px 10px">الدفع بالترتيب: ✅ يدفع حتى هذا الشهر، وإلغاؤه يتراجع. تُدار الخطط من تبويب «الأقساط».</div></div>`;
        } else if (s.k === "debt") { const ls = debtLines(st.cur), allset = ls.length && ls.every((l: any) => l.c);
          h += `<div class="sec"><h3 style="background:${s.c}"><span>${s.icon} ${s.t}</span><span style="display:flex;gap:8px;align-items:center">${ls.length ? `<button class="allbtn" data-all="debt">${allset ? "⬜ إلغاء الكل" : "✅ تحديد الكل"}</button>` : ""}<span class="stot">${fmt(sumChk(st.cur, "debt"))}</span></span></h3>`;
          if (!ls.length) h += `<div class="hint" style="padding:10px 13px">لا سداد ديون هذا الشهر. أضِف دفعة بالأسفل.</div>`;
          ls.forEach((l: any) => { h += `<div class="rowL ${l.c ? "" : "off"}" data-sec="debt" data-i="${l.i}"><button class="chk ${l.c ? "on" : ""}" data-act="chk">${l.c ? "✅" : "⬜"}</button><input class="nm" value="${esc(l.l)}" data-act="lbl"><input class="amt" type="number" value="${l.a}" data-act="amt"><button class="del" data-act="del">🗑</button></div>`; });
          h += `<div class="addrow"><span style="font-size:12.5px;color:var(--muted)">سدّد لـ:</span><select class="inpt" id="sfDP">${st.people.map((p: any, i: number) => `<option value="${i}">${esc(p.name)} — متبقّي ${fmt((+p.original || 0) - paidPerson(p.name))}</option>`).join("")}</select><input class="inpt" id="sfDA" type="number" placeholder="مبلغ" style="width:100px"><button class="btn dark" id="sfDAdd">＋ دفعة</button></div></div>`;
        } else { const rows = rowsOf(st.cur, s.k), allset = rows.length && rows.every((r: any) => r.c);
          h += `<div class="sec"><h3 style="background:${s.c}"><span>${s.icon} ${s.t}</span><span style="display:flex;gap:8px;align-items:center"><button class="allbtn" data-all="${s.k}">${allset ? "⬜ إلغاء الكل" : "✅ تحديد الكل"}</button><span class="stot">${fmt(sumChk(st.cur, s.k))}</span></span></h3>`;
          rows.forEach((r: any, i: number) => { const neg = (+r.a < 0) ? "neg" : ""; h += `<div class="rowL ${r.c ? "" : "off"}" data-sec="${s.k}" data-i="${i}"><button class="chk ${r.c ? "on" : ""}" data-act="chk">${r.c ? "✅" : "⬜"}</button><input class="nm" value="${esc(r.l)}" data-act="lbl"><input class="amt ${neg}" type="number" value="${r.a}" data-act="amt"><button class="del" data-act="del">🗑</button></div>`; });
          h += `<button class="addb" data-add="${s.k}">＋ إضافة بند</button><div class="hint" style="padding:0 13px 10px">من أصل ${fmt(sumAll(st.cur, s.k))} مخطّط</div></div>`;
        }
      });
      return h; };
    const viewInst = () => { const total = st.plans.reduce((a: number, p: any) => a + planCalc(p).total, 0), paid = st.plans.reduce((a: number, p: any) => a + planCalc(p).paid, 0), cl = instLines(st.cur);
      let h = `<div class="grid k4"><div class="kpi"><div class="l">إجمالي الأقساط</div><div class="v tabnum">${fmt(total)}</div></div><div class="kpi income"><div class="l">المدفوع</div><div class="v tabnum" style="color:var(--pos)">${fmt(paid)}</div></div><div class="kpi out"><div class="l">المتبقّي</div><div class="v tabnum" style="color:var(--neg)">${fmt(total - paid)}</div></div><div class="kpi net"><div class="l">عدد الخطط</div><div class="v tabnum">${st.plans.length}</div></div></div>`;
      h += `<div class="sec"><h3 style="background:var(--install)"><span>💳 أقساط ${mLabel(st.cur)}</span><span class="stot">${fmt(instPaid(st.cur))} / ${fmt(instPlanned(st.cur))}</span></h3>`;
      if (!cl.length) h += `<div class="hint" style="padding:12px 13px">لا أقساط مستحقّة هذا الشهر.</div>`;
      cl.forEach((l) => { h += `<div class="rowL ${l.paid ? "" : "off"}" data-kind="inst" data-pi="${l.pi}"><button class="chk ${l.paid ? "on" : ""}" data-act="itog">${l.paid ? "✅" : "⬜"}</button><span class="ro">${esc(l.name)} <span style="color:var(--muted);font-size:11px">(${esc(l.group)})</span></span><span class="amt ro2">${fmt2(l.amount)}</span></div>`; });
      h += `<div class="hint" style="padding:8px 13px 12px">✅ يسجّل دفع القسط لهذا الشهر ويؤثّر على صافي ${mLabel(st.cur)}.</div></div>`;
      h += `<div class="card"><h3>كل الخطط — عدّل المبلغ والبداية والنهاية</h3><div class="scrollx"><table class="tbl"><thead><tr><th>الاسم</th><th>المجموعة</th><th>الشهري</th><th>يبدأ</th><th>عدد الأشهر</th><th>ينتهي</th><th>مدفوع</th><th>متبقّي</th><th></th></tr></thead><tbody>`;
      st.plans.forEach((p: any, i: number) => { const c = planCalc(p); const opt = (sel: string) => ORDER.map((m: string) => `<option value="${m}" ${m === sel ? "selected" : ""}>${mLabel(m)}</option>`).join("");
        h += `<tr><td><input value="${esc(p.name)}" data-pln="${i}" data-f="name" style="min-width:120px"></td><td><input value="${esc(p.group)}" data-pln="${i}" data-f="group" style="width:90px"></td><td><input type="number" value="${p.monthly}" data-pln="${i}" data-f="monthly" style="width:85px"></td><td><select data-pln="${i}" data-f="start">${opt(p.start)}</select></td><td><input type="number" value="${p.count}" data-pln="${i}" data-f="count" style="width:60px"></td><td class="tabnum" style="color:var(--muted)">${c.end}</td><td class="tabnum" style="color:var(--pos)">${fmt(c.paid)}</td><td class="tabnum" style="color:var(--neg)">${fmt(c.remaining)}</td><td><button class="del" data-plndel="${i}">🗑</button></td></tr>`; });
      h += `</tbody></table></div><button class="addb" id="sfPlanAdd">＋ إضافة خطة قسط</button></div>`;
      return h; };
    const viewDebts = () => { const orig = st.people.reduce((a: number, p: any) => a + (+p.original || 0), 0), paid = st.people.reduce((a: number, p: any) => a + paidPerson(p.name), 0);
      let h = `<div class="grid k4"><div class="kpi"><div class="l">إجمالي الديون علينا</div><div class="v tabnum">${fmt(orig)}</div></div><div class="kpi income"><div class="l">المدفوع</div><div class="v tabnum" style="color:var(--pos)">${fmt(paid)}</div></div><div class="kpi out"><div class="l">المتبقّي</div><div class="v tabnum" style="color:var(--neg)">${fmt(orig - paid)}</div></div><div class="kpi net"><div class="l">عدد الأشخاص</div><div class="v tabnum">${st.people.length}</div></div></div>
      <div class="hint" style="margin-top:6px">كل دفعة مربوطة بشهر وتؤثّر على صافي ذلك الشهر. ✅ = تمّت.</div>`;
      st.people.forEach((p: any, i: number) => { const pd = paidPerson(p.name), rem = (+p.original || 0) - pd, pct = p.original > 0 ? (pd / p.original * 100) : 0;
        const hist: any[] = []; ORDER.forEach((m: string) => rowsOf(m, "debt").forEach((r: any, ri: number) => { if ((r.l || "").includes(p.name) && p.name.trim() !== "") hist.push({ m, ri, a: +r.a || 0, c: !!r.c }); }));
        h += `<div class="card" style="margin-top:13px"><div class="tline"><span style="font-weight:800">🤝 <input value="${esc(p.name)}" data-prs="${i}" data-f="name" style="border:0;font-weight:800;font-family:inherit;font-size:14px;background:transparent;min-width:120px"></span><span class="pill ${rem <= 0 ? "ok" : "due"}">${rem <= 0 ? "مسدّد" : "متبقّي"}</span></div>
        <div class="prog"><i style="width:${pct.toFixed(0)}%;background:var(--debt)"></i></div>
        <div class="tline" style="margin-top:7px"><span>الأصلي <input type="number" value="${p.original}" data-prs="${i}" data-f="original" style="width:95px;border:1px solid #e2dccd;border-radius:7px;padding:4px"></span><span>المدفوع <b class="tabnum" style="color:var(--pos)">${fmt(pd)}</b></span><span>المتبقّي <b class="tabnum" style="color:var(--neg)">${fmt(rem)}</b></span></div>
        <div class="addrow"><span style="font-size:12.5px;color:var(--muted)">دفعة:</span><select class="inpt" data-pm="${i}">${ORDER.map((m: string) => `<option value="${m}" ${m === st.cur ? "selected" : ""}>${mLabel(m)}</option>`).join("")}</select><input class="inpt" data-pa="${i}" type="number" placeholder="مبلغ" style="width:100px"><button class="btn dark" data-paydebt="${i}">＋ سجّل دفعة</button><button class="del" data-prsdel="${i}">🗑</button></div>
        <div class="scrollx">${hist.length ? `<table class="tbl"><thead><tr><th>الشهر</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead><tbody>${hist.map((x) => `<tr><td>${mLabel(x.m)}</td><td class="tabnum" style="color:var(--pos)">${fmt(x.a)}</td><td><button class="pill ${x.c ? "ok" : "due"}" data-dtg="${x.m}" data-ri="${x.ri}" style="border:0;cursor:pointer;font-family:inherit">${x.c ? "✅ تمّت" : "⬜ مخطّط"}</button></td><td><button class="del" data-ddl="${x.m}" data-ri="${x.ri}">🗑</button></td></tr>`).join("")}</tbody></table>` : `<div class="hint">لا دفعات بعد.</div>`}</div></div>`; });
      h += `<button class="addb" id="sfPrsAdd" style="margin-top:13px">＋ إضافة شخص</button>`;
      return h; };

    const killC = (id: string) => { if (st.charts[id]) { st.charts[id].destroy(); delete st.charts[id]; } };
    const CJS = () => (window as any).Chart;
    const cv = (id: string) => root.querySelector("#" + id);
    const drawTrend = () => { const el = cv("cTrend"), C = CJS(); if (!el || !C) return; killC("t"); const s = series(); st.charts.t = new C(el, { data: { labels: s.map((x: any) => mShort(x.m) + " '" + x.m.slice(2, 4)), datasets: [{ type: "bar", label: "الدخل", data: s.map((x: any) => x.income), backgroundColor: "#2f8f83", borderRadius: 4 }, { type: "bar", label: "الخارج", data: s.map((x: any) => x.out), backgroundColor: "#c0556a", borderRadius: 4 }, { type: "line", label: "المتراكم", data: s.map((x: any) => x.leftover), borderColor: "#6f4e37", backgroundColor: "#6f4e37", tension: .3, borderWidth: 3, pointRadius: 0 }] }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { labels: { font: { family: "Tahoma" } } } }, scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { callback: (v: any) => (v / 1000) + "k", font: { size: 10 } } } } } }); };
    const drawDonut = () => { const el = cv("cDonut"), C = CJS(); if (!el || !C) return; killC("d"); const items = [["المصاريف", sumChk(st.cur, "expense")], ["الزوجة", sumChk(st.cur, "wife")], ["الفواتير", sumChk(st.cur, "bills")], ["الأقساط", instPaid(st.cur)], ["الديون", sumChk(st.cur, "debt")], ["الشخصي", sumChk(st.cur, "personal")], ["الاحتياطي", sumChk(st.cur, "reserve")]].filter((x: any) => x[1] > 0); st.charts.d = new C(el, { type: "doughnut", data: { labels: items.map((i: any) => i[0]), datasets: [{ data: items.map((i: any) => i[1]), backgroundColor: ["#9d3b4a", "#7a4458", "#5b7da6", "#5a52c9", "#c0556a", "#b8862b", "#5e8c64"], borderWidth: 2, borderColor: "#fff" }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "58%", plugins: { legend: { position: "bottom", labels: { font: { size: 10, family: "Tahoma" }, boxWidth: 12 } } } } }); };
    const drawSav = () => { const el = cv("cSav"), C = CJS(); if (!el || !C) return; killC("s"); const s = series(); st.charts.s = new C(el, { type: "line", data: { labels: s.map((x: any) => mShort(x.m)), datasets: [{ label: "% ادخار", data: s.map((x: any) => x.income > 0 ? Math.round(x.net / x.income * 100) : 0), borderColor: "#5e8c64", backgroundColor: "rgba(94,140,100,.15)", fill: true, tension: .3, pointRadius: 0, borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { callback: (v: any) => v + "%", font: { size: 10 } } } } } }); };
    const drawStack = () => { const el = cv("cStack"), C = CJS(); if (!el || !C) return; killC("st"); const cats = [["المصاريف", "expense", "#9d3b4a"], ["الزوجة", "wife", "#7a4458"], ["الفواتير", "bills", "#5b7da6"], ["الأقساط", "__i", "#5a52c9"], ["الديون", "debt", "#c0556a"], ["الشخصي", "personal", "#b8862b"], ["الاحتياطي", "reserve", "#5e8c64"]]; const ds = cats.map((c: any) => ({ label: c[0], backgroundColor: c[2], data: ORDER.map((m: string) => c[1] === "__i" ? instPaid(m) : sumChk(m, c[1])) })); st.charts.st = new C(el, { type: "bar", data: { labels: ORDER.map((m: string) => mShort(m) + " '" + m.slice(2, 4)), datasets: ds }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { size: 9, family: "Tahoma" }, boxWidth: 10 } } }, scales: { x: { stacked: true, ticks: { font: { size: 8 } } }, y: { stacked: true, ticks: { callback: (v: any) => (v / 1000) + "k", font: { size: 9 } } } } } }); };
    const drawTop = () => { const el = cv("cItems"), C = CJS(); if (!el || !C) return; killC("i"); const top = st.cafe.top_items.slice().sort((a: any, b: any) => b.spend - a.spend).slice(0, 7); st.charts.i = new C(el, { type: "bar", data: { labels: top.map((t: any) => (t.item || "").slice(0, 16)), datasets: [{ label: "الصرف", data: top.map((t: any) => t.spend), backgroundColor: "#8a6a4f", borderRadius: 4 }] }, options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 9 } } } } } }); };
    const drawCafe = () => { const el = cv("cCafe"), C = CJS(); if (!el || !C) return; killC("c"); const ms = Object.keys(st.cafe.income_by_month).sort(); st.charts.c = new C(el, { type: "bar", data: { labels: ms.map(mLabel), datasets: [{ label: "دخل", data: ms.map((m: string) => st.cafe.income_by_month[m] || 0), backgroundColor: "#2f8f83", borderRadius: 4 }, { label: "مصاريف", data: ms.map((m: string) => st.cafe.expense_by_month[m] || 0), backgroundColor: "#c0556a", borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { size: 10, family: "Tahoma" } } } }, scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 9 } } } } } }); };

    const rebuildMsgs = () => { const box = root.querySelector("#sfMsgs"); if (box) { box.innerHTML = st.msgs.map((m: any) => `<div class="msg ${m.who === "me" ? "me" : "bot"}">${m.t}</div>`).join(""); box.scrollTop = box.scrollHeight; } };
    const applyAction = (a: any) => {
      if (!a) return false;
      if (a.type === "add_line") { const arr = st.months[a.month] && st.months[a.month][a.section]; if (!arr) return false; arr.push({ l: String(a.label || "بند"), a: +a.amount || 0, c: true }); persistMonth(a.month); return true; }
      if (a.type === "installment_paid") { const p = st.plans.find((pp: any) => { const x = norm(pp.name), y = norm(a.plan || ""); return x && y && (x.includes(y.slice(0, 3)) || y.includes(x.slice(0, 3))); }); if (!p) return false; const k = ORDER.indexOf(a.month) - ORDER.indexOf(p.start); if (k < 0) return false; setPaid(p, k, a.paid !== false); persistPlans(); return true; }
      return false;
    };
    const ask = async (text: string) => {
      if (!text || !text.trim()) return;
      st.msgs.push({ who: "me", t: text }); st.msgs.push({ who: "bot", t: "…" }); rebuildMsgs();
      try {
        const r = await fetch("/api/finance/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text, month: st.cur }) });
        const j = await r.json();
        st.msgs.pop();
        st.msgs.push({ who: "bot", t: j.reply || "تم." });
        if (applyAction(j.action)) render(); else rebuildMsgs();
      } catch {
        st.msgs.pop(); st.msgs.push({ who: "bot", t: "تعذّر الاتصال بالمساعد، حاول لاحقًا." }); rebuildMsgs();
      }
    };

    const render = () => {
      const s = series();
      const strip = root.querySelector("#sfStrip"); if (strip) strip.innerHTML = ORDER.map((m: string, i: number) => `<div class="chip ${m === st.cur ? "on" : ""}" data-go="${m}"><div class="cn">${mShort(m)} '${m.slice(2, 4)}</div><div class="cb" style="color:${s[i].leftover < 0 ? "var(--neg)" : "var(--pos)"}">${fmt(s[i].leftover)}</div><div class="ct">المتبقّي</div></div>`).join("");
      const tabs = root.querySelector("#sfTabs"); if (tabs) tabs.innerHTML = [["overview", "نظرة عامة"], ["month", "ميزانية الشهر"], ["inst", "الأقساط"], ["debts", "الديون"], ["analytics", "تحليلات"]].map((t) => `<button class="tab ${st.tab === t[0] ? "on" : ""}" data-tab="${t[0]}">${t[1]}</button>`).join("");
      const view = root.querySelector("#sfView"); if (view) view.innerHTML = st.tab === "overview" ? viewOverview() : st.tab === "month" ? viewMonth() : st.tab === "inst" ? viewInst() : st.tab === "debts" ? viewDebts() : viewAnalytics();
      bind();
      if (st.tab === "overview") { drawTrend(); drawDonut(); drawSav(); drawStack(); }
      if (st.tab === "analytics") { drawTop(); drawCafe(); }
      // Center the current month chip by scrolling ONLY the strip horizontally.
      // (scrollIntoView also scrolled the page itself, yanking the user back to the top on every checkbox click.)
      const on = root.querySelector(".chip.on");
      if (strip && on) { const sr = strip.getBoundingClientRect(), or = on.getBoundingClientRect(); strip.scrollLeft += (or.left - sr.left) - (sr.width - or.width) / 2; }
    };
    const setPaid = (p: any, k: number, on: boolean) => { p.paid = on ? Math.max(+p.paid || 0, k + 1) : Math.min(+p.paid || 0, k); };
    const bind = () => {
      root.querySelectorAll("[data-go]").forEach((el: any) => el.onclick = () => { st.cur = el.dataset.go; render(); });
      const pv = root.querySelector("#sfPrev"); if (pv) pv.onclick = () => { const i = ORDER.indexOf(st.cur); if (i < ORDER.length - 1) { st.cur = ORDER[i + 1]; render(); } };
      const nx = root.querySelector("#sfNext"); if (nx) nx.onclick = () => { const i = ORDER.indexOf(st.cur); if (i > 0) { st.cur = ORDER[i - 1]; render(); } };
      root.querySelectorAll("[data-tab]").forEach((el: any) => el.onclick = () => { st.tab = el.dataset.tab; render(); });
      root.querySelectorAll(".rowL[data-sec]").forEach((row: any) => { const sec = row.dataset.sec, i = +row.dataset.i; row.querySelectorAll("[data-act]").forEach((el: any) => { const a = el.dataset.act;
        if (a === "chk") el.onclick = () => { st.months[st.cur][sec][i].c = !st.months[st.cur][sec][i].c; persistMonth(st.cur); render(); };
        if (a === "amt") el.onchange = () => { st.months[st.cur][sec][i].a = parseFloat(el.value) || 0; persistMonth(st.cur); render(); };
        if (a === "lbl") el.onchange = () => { st.months[st.cur][sec][i].l = el.value; persistMonth(st.cur); };
        if (a === "del") el.onclick = () => { st.months[st.cur][sec].splice(i, 1); persistMonth(st.cur); render(); }; }); });
      root.querySelectorAll('.rowL[data-kind="inst"]').forEach((row: any) => { const pi = +row.dataset.pi; const b = row.querySelector('[data-act="itog"]'); if (b) b.onclick = () => { const p = st.plans[pi]; const k = ORDER.indexOf(st.cur) - ORDER.indexOf(p.start); if (k < 0) return; setPaid(p, k, !(k < (+p.paid || 0))); persistPlans(); render(); }; });
      root.querySelectorAll("[data-add]").forEach((b: any) => b.onclick = () => { st.months[st.cur][b.dataset.add].push({ l: "بند جديد", a: 0, c: false }); persistMonth(st.cur); render(); });
      root.querySelectorAll("[data-all]").forEach((b: any) => b.onclick = () => { const k = b.dataset.all;
        if (k === "installment") { const ls = instLines(st.cur); const allp = ls.length && ls.every((l: any) => l.paid); ls.forEach((l: any) => { const p = st.plans[l.pi]; const kk = ORDER.indexOf(st.cur) - ORDER.indexOf(p.start); setPaid(p, kk, !allp); }); persistPlans(); }
        else { const rs = rowsOf(st.cur, k); const t = !(rs.length && rs.every((r: any) => r.c)); rs.forEach((r: any) => r.c = t); persistMonth(st.cur); } render(); });
      const aon = root.querySelector("#sfAllOn"); if (aon) aon.onclick = () => { MAN.forEach((s: string) => rowsOf(st.cur, s).forEach((r: any) => r.c = true)); instLines(st.cur).forEach((l: any) => { const p = st.plans[l.pi]; setPaid(p, ORDER.indexOf(st.cur) - ORDER.indexOf(p.start), true); }); persistMonth(st.cur); persistPlans(); render(); };
      const aoff = root.querySelector("#sfAllOff"); if (aoff) aoff.onclick = () => { MAN.forEach((s: string) => rowsOf(st.cur, s).forEach((r: any) => r.c = false)); instLines(st.cur).forEach((l: any) => { const p = st.plans[l.pi]; setPaid(p, ORDER.indexOf(st.cur) - ORDER.indexOf(p.start), false); }); persistMonth(st.cur); persistPlans(); render(); };
      const dadd = root.querySelector("#sfDAdd"); if (dadd) dadd.onclick = () => { const pi = +root.querySelector("#sfDP").value; const amt = parseFloat((root.querySelector("#sfDA") as any).value) || 0; if (amt > 0) { rowsOf(st.cur, "debt").push({ l: st.people[pi].name, a: amt, c: true }); persistMonth(st.cur); render(); } else flash("اكتب مبلغًا"); };
      root.querySelectorAll("[data-pln]").forEach((el: any) => { const i = +el.dataset.pln, f = el.dataset.f; el.onchange = () => { const p = st.plans[i]; if (f === "monthly") p.monthly = parseFloat(el.value) || 0; else if (f === "count") { p.count = Math.max(parseInt(el.value) || 1, 1); p.paid = Math.min(p.paid, p.count); } else p[f] = el.value; persistPlans(); render(); }; });
      root.querySelectorAll("[data-plndel]").forEach((b: any) => b.onclick = () => { if (confirm("حذف الخطة؟")) { st.plans.splice(+b.dataset.plndel, 1); persistPlans(); render(); } });
      const padd = root.querySelector("#sfPlanAdd"); if (padd) padd.onclick = () => { st.plans.push({ name: "خطة جديدة", group: "أخرى", monthly: 0, count: 1, start: st.cur, paid: 0, total: 0 }); persistPlans(); render(); };
      root.querySelectorAll("[data-prs]").forEach((el: any) => { const i = +el.dataset.prs, f = el.dataset.f; el.onchange = () => { if (f === "original") st.people[i].original = parseFloat(el.value) || 0; else st.people[i].name = el.value; persistPeople(); render(); }; });
      root.querySelectorAll("[data-paydebt]").forEach((b: any) => b.onclick = () => { const i = +b.dataset.paydebt; const m = (root.querySelector('[data-pm="' + i + '"]') as any).value; const amt = parseFloat((root.querySelector('[data-pa="' + i + '"]') as any).value) || 0; if (amt > 0) { rowsOf(m, "debt").push({ l: st.people[i].name, a: amt, c: true }); persistMonth(m); render(); } else flash("اكتب مبلغًا"); });
      root.querySelectorAll("[data-dtg]").forEach((b: any) => b.onclick = () => { const m = b.dataset.dtg, ri = +b.dataset.ri; st.months[m].debt[ri].c = !st.months[m].debt[ri].c; persistMonth(m); render(); });
      root.querySelectorAll("[data-ddl]").forEach((b: any) => b.onclick = () => { const m = b.dataset.ddl, ri = +b.dataset.ri; st.months[m].debt.splice(ri, 1); persistMonth(m); render(); });
      const prsadd = root.querySelector("#sfPrsAdd"); if (prsadd) prsadd.onclick = () => { st.people.push({ name: "اسم جديد", original: 0 }); persistPeople(); render(); };
      root.querySelectorAll("[data-prsdel]").forEach((b: any) => b.onclick = () => { if (confirm("حذف الشخص؟")) { st.people.splice(+b.dataset.prsdel, 1); persistPeople(); render(); } });
      const ab = root.querySelector("#sfAskBtn"), ai: any = root.querySelector("#sfAsk");
      if (ab) ab.onclick = () => { ask(ai.value); ai.value = ""; };
      if (ai) ai.onkeydown = (e: any) => { if (e.key === "Enter") { ask(ai.value); ai.value = ""; } };
      root.querySelectorAll("[data-q]").forEach((c: any) => c.onclick = () => ask(c.dataset.q));
    };

    root.innerHTML = `<style>${CSS}</style><div class="sf"><div class="msel"><div class="mrow"><button class="navbtn" id="sfPrev">›</button><div class="strip" id="sfStrip"></div><button class="navbtn" id="sfNext">‹</button></div></div><div class="tabs" id="sfTabs"></div><div id="sfView"></div><div class="save" id="sfSave"></div></div>`;
    render();
    if (!CJS()) { let sc = document.getElementById("sf-chartjs") as any; if (!sc) { sc = document.createElement("script"); sc.id = "sf-chartjs"; sc.src = "https://cdn.jsdelivr.net/npm/chart.js@4.5.0/dist/chart.umd.js"; document.head.appendChild(sc); } sc.addEventListener("load", () => render()); }
    return () => { Object.values(st.charts).forEach((c: any) => { try { c.destroy(); } catch (e) {} }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} />;
}
