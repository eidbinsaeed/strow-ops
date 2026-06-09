/**
 * Strow Ops owner-shell dictionary.
 *
 * Keys are descriptive (e.g. "nav.sales") not literal English strings, so
 * we can refactor English copy without touching translations. Numbers stay
 * in Latin digits (0-9) regardless of locale.
 */

export type Locale = "en" | "ar";

export const LOCALES: Locale[] = ["en", "ar"];

export const DICT: Record<string, Record<Locale, string>> = {
  // Brand + chrome
  "brand.title": { en: "Strow Ops", ar: "Strow Ops" },
  "brand.role": { en: "Owner", ar: "المالك" },
  "lang.toggle": { en: "العربية", ar: "English" },
  "common.signin": { en: "Sign in", ar: "تسجيل الدخول" },
  "common.signedin": { en: "Signed in", ar: "تم تسجيل الدخول" },
  "common.signout": { en: "Sign out", ar: "تسجيل الخروج" },
  "common.dashboard": { en: "← Dashboard", ar: "→ لوحة التحكم" },
  "common.cancel": { en: "Cancel", ar: "إلغاء" },
  "common.save": { en: "Save changes", ar: "حفظ التعديلات" },
  "common.saving": { en: "Saving...", ar: "جارٍ الحفظ..." },
  "common.close": { en: "Close", ar: "إغلاق" },
  "common.barista_link": { en: "Barista? Go to barista login", ar: "باريستا؟ اذهب لتسجيل دخول الباريستا" },

  // Nav groups
  "nav.group.operations": { en: "Operations", ar: "العمليات" },
  "nav.group.books": { en: "Books", ar: "الدفاتر" },
  "nav.group.setup": { en: "Setup", ar: "الإعدادات" },
  "nav.group.reporting": { en: "Reporting", ar: "التقارير" },

  // Nav links
  "nav.dashboard": { en: "Dashboard", ar: "لوحة التحكم" },
  "nav.pending": { en: "Pending Approval", ar: "بانتظار الاعتماد" },
  "nav.sales": { en: "Sales", ar: "المبيعات" },
  "nav.purchases": { en: "Purchases", ar: "المشتريات" },
  "nav.recurring": { en: "Recurring Costs", ar: "المصاريف الثابتة" },
  "nav.liabilities": { en: "Liabilities", ar: "الالتزامات" },
  "nav.vendors": { en: "Vendors", ar: "الموردون" },
  "nav.coa": { en: "Chart of Accounts", ar: "دليل الحسابات" },
  "nav.staff": { en: "Staff", ar: "الموظفون" },
  "nav.reports": { en: "Reports", ar: "التقارير" },
  "nav.audit": { en: "Audit Trail", ar: "سجل التدقيق" },
  "nav.menu_open": { en: "Open menu", ar: "فتح القائمة" },
  "nav.menu_close": { en: "Close menu", ar: "إغلاق القائمة" },

  // Status
  "status.confirmed": { en: "Confirmed", ar: "معتمد" },
  "status.pending": { en: "Pending", ar: "معلق" },
  "status.flagged": { en: "Flagged", ar: "مُعلَّم" },
  "status.rejected": { en: "Rejected", ar: "مرفوض" },

  // Row actions
  "action.confirm": { en: "Confirm", ar: "اعتماد" },
  "action.edit": { en: "Edit", ar: "تعديل" },
  "action.reject": { en: "Reject", ar: "رفض" },
  "action.delete": { en: "Delete", ar: "حذف" },
  "action.send_to_pending": { en: "Send to pending", ar: "إعادة للمراجعة" },
  "action.view_bill": { en: "View bill", ar: "عرض الفاتورة" },
  "action.open_in_drive": { en: "Open in Drive", ar: "فتح في Drive" },
  "action.confirm_reject": { en: "Mark as rejected? Audit log keeps the record.", ar: "تعليم كمرفوض؟ سيبقى السجل في سجل التدقيق." },
  "action.confirm_delete": { en: "Permanently delete this entry? Audit log keeps the snapshot.", ar: "حذف هذا السجل نهائياً؟ سيُحتفظ بنسخة في سجل التدقيق." },
  "action.confirm_send_pending": { en: "Send this back to pending so it shows in the approval queue again?", ar: "إرجاع هذا السجل للمراجعة ليظهر في قائمة الاعتماد مرة أخرى؟" },

  // Filters
  "filter.search": { en: "Search", ar: "بحث" },
  "filter.search.barista_or_note": { en: "Search barista or note...", ar: "ابحث باسم الباريستا أو الملاحظات..." },
  "filter.search.vendor_invoice_note": { en: "Search vendor, invoice, or note...", ar: "ابحث باسم المورد أو رقم الفاتورة أو الملاحظات..." },
  "filter.between": { en: "to", ar: "إلى" },
  "filter.clear": { en: "Clear filters", ar: "مسح المرشحات" },

  // Page H1s
  "page.sales": { en: "Sales", ar: "المبيعات" },
  "page.purchases": { en: "Purchases", ar: "المشتريات" },
  "page.pending": { en: "Pending Approval", ar: "بانتظار الاعتماد" },
  "page.reports": { en: "Reports", ar: "التقارير" },
  "page.audit": { en: "Audit Trail", ar: "سجل التدقيق" },
  "page.vendors": { en: "Vendors", ar: "الموردون" },
  "page.coa": { en: "Chart of Accounts", ar: "دليل الحسابات" },
  "page.staff": { en: "Staff", ar: "الموظفون" },
  "page.recurring": { en: "Recurring Costs", ar: "المصاريف الثابتة" },
  "page.liabilities": { en: "Liabilities", ar: "الالتزامات" },
  "page.dashboard": { en: "Dashboard", ar: "لوحة التحكم" },

  // Counters / summary
  "summary.sales_count": { en: "sales recorded", ar: "عملية بيع مسجلة" },
  "summary.bills_count": { en: "bills recorded", ar: "فاتورة مسجلة" },
  "summary.total_label": { en: "total", ar: "الإجمالي" },
  "summary.no_match": { en: "No records match the current filters.", ar: "لا توجد سجلات تطابق المرشحات الحالية." },
  "summary.queue_empty": { en: "Queue is empty. Items the AI is unsure about land here.", ar: "قائمة الانتظار فارغة. تظهر هنا السجلات التي يحتاج الذكاء الاصطناعي إلى مراجعتها." },

  // Reports
  "report.period": { en: "Period", ar: "الفترة" },
  "report.download_csv": { en: "Download CSV", ar: "تنزيل CSV" },
  "report.print_pdf": { en: "Print / Save as PDF", ar: "طباعة / حفظ PDF" },
  "report.monthly_pnl": { en: "Monthly P&L", ar: "الأرباح والخسائر الشهرية" },
  "report.category_breakdown": { en: "Category Breakdown", ar: "توزيع المصاريف حسب الفئة" },
  "report.vat": { en: "VAT Report (5% UAE)", ar: "تقرير ضريبة القيمة المضافة (٥٪ الإمارات)" },
  "report.section.sales": { en: "Sales", ar: "المبيعات" },
  "report.section.purchases_by_cat": { en: "Purchases by category", ar: "المشتريات حسب الفئة" },
  "report.section.gross_margin": { en: "Gross margin", ar: "هامش الربح الإجمالي" },
  "report.section.output_vat": { en: "Output VAT (collected from sales)", ar: "ضريبة المخرجات (المُحصَّلة من المبيعات)" },
  "report.section.input_vat": { en: "Input VAT (paid on purchases)", ar: "ضريبة المدخلات (المدفوعة على المشتريات)" },
  "report.section.net_vat": { en: "Net VAT payable", ar: "صافي الضريبة المستحقة" },
  "report.label.cash": { en: "Cash", ar: "نقد" },
  "report.label.card": { en: "Card", ar: "بطاقة" },
  "report.label.online": { en: "Online", ar: "أونلاين" },
  "report.label.total_sales": { en: "Total sales", ar: "إجمالي المبيعات" },
  "report.label.total_purchases": { en: "Total purchases", ar: "إجمالي المشتريات" },
  "report.label.no_purchases": { en: "No purchases in period.", ar: "لا توجد مشتريات في هذه الفترة." },
  "report.col.category": { en: "Category", ar: "الفئة" },
  "report.col.bills": { en: "Bills", ar: "الفواتير" },
  "report.col.total": { en: "Total", ar: "الإجمالي" },
  "report.col.share": { en: "Share", ar: "النسبة" },
  "report.vat.payable": { en: "VAT payable to FTA", ar: "ضريبة مستحقة للاتحادية للضرائب" },
  "report.vat.refundable": { en: "VAT refundable from FTA", ar: "ضريبة مستردة من الاتحادية للضرائب" },
  "report.disclaimer": { en: "Talk to your accountant before filing.", ar: "راجع محاسبك قبل التقديم." },
  "report.landing.tagline": { en: "Pick a report. Each one supports a custom period, CSV download, and print-to-PDF.", ar: "اختر تقريراً. كل تقرير يدعم فترة مخصصة وتنزيل CSV وطباعة PDF." },

  // Login (owner-side)
  "login.title": { en: "Owner sign in", ar: "تسجيل دخول المالك" },
  "login.enter_pin": { en: "Enter your owner PIN", ar: "أدخل رمز PIN الخاص بك" },
  "login.wrong_pin": { en: "Wrong PIN. Try again.", ar: "رمز PIN غير صحيح. حاول مرة أخرى." },
  "login.cant_signin": { en: "Could not sign in. Try again.", ar: "تعذر تسجيل الدخول. حاول مرة أخرى." },
  "login.network_err": { en: "Network error. Try again.", ar: "خطأ في الشبكة. حاول مرة أخرى." },
};

export type DictKey = keyof typeof DICT;

// More keys appended in mobile/i18n follow-up
DICT["card.cash"] = { en: "Cash", ar: "نقد" };
DICT["card.card"] = { en: "Card", ar: "بطاقة" };
DICT["card.online"] = { en: "Online", ar: "أونلاين" };
DICT["card.by"] = { en: "by", ar: "بواسطة" };
DICT["card.vat"] = { en: "VAT", ar: "ضريبة" };
DICT["card.unknown_vendor"] = { en: "Unknown vendor", ar: "مورد غير معروف" };
DICT["pay.cash"] = { en: "Cash", ar: "نقد" };
DICT["pay.card"] = { en: "Card", ar: "بطاقة" };
DICT["pay.bank_transfer"] = { en: "Bank transfer", ar: "حوالة بنكية" };
DICT["pay.credit"] = { en: "Credit", ar: "آجل" };
DICT["page.audit"] = { en: "Audit Trail", ar: "سجل التدقيق" };
DICT["page.audit.tagline"] = { en: "Last 200 actions across the app.", ar: "آخر ٢٠٠ عملية في النظام." };
DICT["page.dashboard.tagline"] = { en: "Live snapshot of today's activity.", ar: "نظرة عامة على نشاط اليوم." };

DICT["dash.today_at"] = { en: "Today at Qave Cafe - Main", ar: "اليوم في مقهى قهوة - الفرع الرئيسي" };
DICT["dash.todays_flows"] = { en: "Today's flows", ar: "حركة اليوم" };
DICT["dash.sales_today"] = { en: "Sales today", ar: "مبيعات اليوم" };
DICT["dash.expenses_today"] = { en: "Expenses today", ar: "مصاريف اليوم" };
DICT["dash.net_today"] = { en: "Net today", ar: "صافي اليوم" };
DICT["dash.needs_review"] = { en: "Needs review", ar: "بحاجة للمراجعة" };
DICT["dash.cash_card_online"] = { en: "Cash + Card + Online", ar: "نقد + بطاقة + أونلاين" };
DICT["dash.all_payments"] = { en: "All payment methods", ar: "جميع طرق الدفع" };
DICT["dash.ai_flagged"] = { en: "AI-flagged items", ar: "سجلات أشار إليها الذكاء الاصطناعي" };
DICT["dash.setup_live"] = { en: "Setup - live from your database", ar: "الإعدادات - من قاعدة البيانات مباشرة" };
DICT["dash.locations"] = { en: "Locations", ar: "الفروع" };
DICT["dash.baristas"] = { en: "Baristas", ar: "الباريستا" };
DICT["dash.on_shift"] = { en: "On shift now", ar: "في الدوام الآن" };
DICT["dash.vendors_count"] = { en: "Vendors", ar: "الموردون" };
DICT["dash.categories_count"] = { en: "Categories", ar: "الفئات" };
DICT["dash.active"] = { en: "Active", ar: "نشط" };
DICT["dash.recent_activity"] = { en: "Recent activity", ar: "النشاط الأخير" };
DICT["dash.no_submissions"] = { en: "No submissions yet today.", ar: "لا توجد سجلات اليوم بعد." };
DICT["dash.manage_staff"] = { en: "Manage staff", ar: "إدارة الموظفين" };
DICT["dash.manage_staff_hint"] = { en: "Add staff, set 4-digit PINs, toggle on-shift status", ar: "إضافة موظفين، تعيين رموز PIN، تبديل حالة الدوام" };
DICT["dash.pending_hint"] = { en: "Items the AI was not sure about", ar: "سجلات لم يتأكد منها الذكاء الاصطناعي" };

// Dashboard hero + alerts + 7-day flow chart (Session 8)
DICT["dash.hero.projected_net"] = { en: "Projected net this month", ar: "صافي الربح المتوقع هذا الشهر" };
DICT["dash.hero.basis"] = { en: "Projected from days closed so far", ar: "متوقع بناءً على الأيام المُقفلة حتى الآن" };
DICT["dash.hero.days_closed"] = { en: "days closed", ar: "يوم مُقفل" };
DICT["dash.hero.revenue_mtd"] = { en: "Revenue so far", ar: "الإيرادات حتى الآن" };
DICT["dash.hero.variable_mtd"] = { en: "Variable expenses", ar: "المصاريف المتغيرة" };
DICT["dash.hero.fixed_monthly"] = { en: "Fixed monthly", ar: "المصاريف الثابتة الشهرية" };
DICT["dash.hero.vat_net"] = { en: "Net VAT owed", ar: "صافي ضريبة القيمة المضافة المستحقة" };
DICT["dash.trend.vs_avg"] = { en: "vs 7-day avg", ar: "مقارنةً بمتوسط ٧ أيام" };
DICT["dash.alerts.title"] = { en: "Needs your eyes", ar: "يحتاج إلى انتباهك" };
DICT["dash.alerts.all_clear"] = { en: "All clear — nothing waiting on you.", ar: "كل شيء على ما يرام — لا شيء بانتظارك." };
DICT["dash.alerts.pending"] = { en: "submissions waiting for approval", ar: "سجلات بانتظار الاعتماد" };
DICT["dash.alerts.uncategorized"] = { en: "purchases with no category", ar: "مشتريات بدون فئة" };
DICT["dash.alerts.missing_float"] = { en: "closings missing a cash float", ar: "إقفالات بدون رصيد نقدي ابتدائي" };
DICT["dash.alerts.missing_trn"] = { en: "vendors missing a tax number (TRN)", ar: "موردون بدون رقم تسجيل ضريبي" };
DICT["dash.alerts.open_liabilities"] = { en: "open liabilities (money owed or held)", ar: "التزامات مفتوحة (مبالغ مستحقة أو محتجزة)" };
DICT["dash.alerts.cash_short"] = { en: "Cash short on", ar: "عجز نقدي بتاريخ" };
DICT["dash.alerts.cash_over"] = { en: "Cash over on", ar: "فائض نقدي بتاريخ" };
DICT["dash.chart.title"] = { en: "Last 7 days", ar: "آخر ٧ أيام" };
DICT["dash.chart.no_data"] = { en: "No confirmed closings in the last 7 days.", ar: "لا توجد إقفالات معتمدة في آخر ٧ أيام." };
DICT["dash.chart.caption"] = { en: "Daily revenue (AED). Faded bars are weekends (Fri/Sat).", ar: "الإيراد اليومي (درهم). الأعمدة الباهتة هي عطلة نهاية الأسبوع (الجمعة/السبت)." };

// Cash-on-hand card (Session 9)
DICT["cash.title"] = { en: "Cash on hand", ar: "النقد المتوفر" };
DICT["cash.subtitle"] = { en: "Till + safe combined", ar: "الدرج + الخزنة معاً" };
DICT["cash.in_today"] = { en: "in today", ar: "وارد اليوم" };
DICT["cash.out_today"] = { en: "out today", ar: "صادر اليوم" };
DICT["cash.take_out"] = { en: "Take cash out", ar: "سحب نقد" };
DICT["cash.recount"] = { en: "Recount / set balance", ar: "إعادة العدّ / ضبط الرصيد" };
DICT["cash.last_counted"] = { en: "counted", ar: "عُدّ في" };
DICT["cash.needs_opening"] = { en: "No starting balance set yet — use Recount / set balance to set one.", ar: "لم يتم تعيين رصيد ابتدائي — استخدم إعادة العدّ / ضبط الرصيد لتعيينه." };

// Items / purchase tracking (Session 10)
DICT["nav.items"] = { en: "Items", ar: "الأصناف" };
DICT["page.items"] = { en: "Items", ar: "الأصناف" };
DICT["items.tracked"] = { en: "items tracked", ar: "صنف متتبَّع" };
DICT["items.total_spend"] = { en: "total spend", ar: "إجمالي الإنفاق" };
DICT["items.review"] = { en: "Needs your review", ar: "يحتاج إلى مراجعتك" };
DICT["items.suspicious_lines"] = { en: "suspicious lines (review, then fix in Purchases)", ar: "سطور مشبوهة (راجعها ثم صححها في المشتريات)" };
DICT["items.unmapped_lines"] = { en: "lines not yet matched to an item", ar: "سطور لم تُطابق بصنف بعد" };
DICT["items.unmapped_note"] = { en: "These are mixed/combo orders or unclear text — money is still counted, but can't be split per item.", ar: "هذه طلبات مختلطة أو نص غير واضح — المبلغ محسوب لكنه لا يمكن تقسيمه لكل صنف." };
DICT["items.flag"] = { en: "to review", ar: "للمراجعة" };
DICT["items.qty"] = { en: "Qty bought", ar: "الكمية" };
DICT["items.spend"] = { en: "Total spend", ar: "الإنفاق" };
DICT["items.typical_price"] = { en: "Typical price", ar: "السعر المعتاد" };
DICT["items.buys"] = { en: "purchases", ar: "عملية شراء" };
DICT["items.every"] = { en: "every", ar: "كل" };
DICT["items.days"] = { en: "days", ar: "يوم" };
DICT["items.last"] = { en: "last", ar: "آخر شراء" };
DICT["items.range"] = { en: "range", ar: "النطاق" };
DICT["items.supplier"] = { en: "supplier", ar: "مورّد" };
DICT["items.suppliers"] = { en: "suppliers", ar: "موردون" };
DICT["items.price_each"] = { en: "price each", ar: "السعر للوحدة" };

DICT["action.items"] = { en: "Items", ar: "الأصناف" };

DICT["nav.group.personal"] = { en: "Personal", ar: "الشخصي" };
DICT["nav.finance"] = { en: "Personal Finance", ar: "المالية الشخصية" };

// Sales Insights page (analytics)
DICT["nav.insights"] = { en: "Insights", ar: "التحليلات" };
DICT["page.insights"] = { en: "Sales Insights", ar: "تحليلات المبيعات" };
DICT["insights.subtitle"] = { en: "Understand your daily swings, best days, and where the next sales come from.", ar: "افهم تذبذب مبيعاتك اليومي، وأفضل أيامك، ومن أين تأتي المبيعات القادمة." };
DICT["insights.empty"] = { en: "No confirmed sales yet to analyze.", ar: "لا توجد مبيعات معتمدة لتحليلها بعد." };

DICT["insights.kpi.total"] = { en: "Total recorded", ar: "إجمالي المسجّل" };
DICT["insights.kpi.days"] = { en: "days", ar: "يوم" };
DICT["insights.kpi.avg"] = { en: "Average day", ar: "متوسط اليوم" };
DICT["insights.kpi.avg_hint"] = { en: "your baseline", ar: "خط الأساس" };
DICT["insights.kpi.best"] = { en: "Best single day", ar: "أفضل يوم" };
DICT["insights.kpi.lowest"] = { en: "Lowest day", ar: "أدنى يوم" };

DICT["insights.dow.title"] = { en: "Which days earn the most?", ar: "أي الأيام تحقق أكثر؟" };
DICT["insights.dow.caption"] = { en: "Average sales by day of week. Dark = your strongest days, red = weakest.", ar: "متوسط المبيعات حسب يوم الأسبوع. الداكن = أقوى أيامك، الأحمر = الأضعف." };

DICT["insights.pay.title"] = { en: "How customers pay", ar: "كيف يدفع العملاء" };
DICT["insights.pay.card"] = { en: "Card", ar: "بطاقة" };
DICT["insights.pay.online"] = { en: "Online", ar: "أونلاين" };
DICT["insights.pay.cash"] = { en: "Cash", ar: "نقد" };
DICT["insights.pay.caption"] = { en: "Share of total revenue by payment method.", ar: "نسبة كل وسيلة دفع من إجمالي الإيراد." };

DICT["insights.trend.title"] = { en: "Last 14 days", ar: "آخر ١٤ يوماً" };
DICT["insights.trend.caption"] = { en: "Daily revenue (AED), most recent on the right.", ar: "الإيراد اليومي (درهم)، الأحدث على اليمين." };

DICT["insights.recs.title"] = { en: "What this means for your cafe", ar: "ماذا يعني هذا لمقهاك" };
DICT["insights.rec.staffing.title"] = { en: "Best days & staffing", ar: "أفضل الأيام والتوظيف" };
DICT["insights.rec.staffing.body"] = { en: "{best} ({bestAmt}) and {best2} ({best2Amt}) are your strongest days. Make sure these are fully staffed and stocked — never run out of your top sellers, and prep extra the night before.", ar: "{best} ({bestAmt}) و{best2} ({best2Amt}) هما أقوى أيامك. تأكد من توفّر العمالة والمخزون الكامل فيهما — لا تنفد أكثر أصنافك مبيعاً، وحضّر كميات إضافية في الليلة السابقة." };
DICT["insights.rec.weakdays.title"] = { en: "Fix your weak days", ar: "عالج أيامك الضعيفة" };
DICT["insights.rec.weakdays.body"] = { en: "{weak} ({weakAmt}) and {weak2} ({weak2Amt}) drag your average down. Run a standing offer on those days — a combo deal or happy-hour pricing — to pull traffic into the slow days instead of competing on the busy ones.", ar: "{weak} ({weakAmt}) و{weak2} ({weak2Amt}) يخفضان متوسطك. أطلق عرضاً ثابتاً في هذين اليومين — كومبو أو تسعير ساعة سعيدة — لجذب الزبائن إلى الأيام الهادئة بدل المنافسة في الأيام المزدحمة." };
DICT["insights.rec.ticket.title"] = { en: "Grow the average ticket", ar: "ارفع متوسط الفاتورة" };
DICT["insights.rec.ticket.body"] = { en: "Card is {cardPct}% of revenue — most customers pay by card and spend more freely. Train staff to suggest one add-on with every order (a pastry with coffee, an extra shot, a cold drink). Even +AED 5 per customer moves the daily total.", ar: "البطاقة تشكّل {cardPct}% من الإيراد — معظم العملاء يدفعون بالبطاقة وينفقون بسهولة أكبر. درّب الفريق على اقتراح إضافة واحدة مع كل طلب (حلوى مع القهوة، شوت إضافي، مشروب بارد). حتى +٥ دراهم لكل عميل تحرّك إجمالي اليوم." };
DICT["insights.rec.customers.title"] = { en: "Bring in more customers", ar: "اجذب المزيد من العملاء" };
DICT["insights.rec.customers.body"] = { en: "Online is only {onlPct}% of sales. Push delivery-app visibility and a simple loyalty card (buy 9, get 1 free) to turn one-time visits into repeats. Promote your slow days to delivery and social.", ar: "الأونلاين {onlPct}% فقط من المبيعات. عزّز ظهورك على تطبيقات التوصيل وأطلق بطاقة ولاء بسيطة (اشترِ ٩ واحصل على ١ مجاناً) لتحويل الزيارات العابرة إلى متكررة. روّج لأيامك الهادئة عبر التوصيل ووسائل التواصل." };

DICT["insights.day.0"] = { en: "Sun", ar: "أحد" };
DICT["insights.day.1"] = { en: "Mon", ar: "إثنين" };
DICT["insights.day.2"] = { en: "Tue", ar: "ثلاثاء" };
DICT["insights.day.3"] = { en: "Wed", ar: "أربعاء" };
DICT["insights.day.4"] = { en: "Thu", ar: "خميس" };
DICT["insights.day.5"] = { en: "Fri", ar: "جمعة" };
DICT["insights.day.6"] = { en: "Sat", ar: "سبت" };
