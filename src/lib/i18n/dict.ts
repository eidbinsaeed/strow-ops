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
