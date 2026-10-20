/**
 * Every owner page, grouped the way the phone tab bar is: Today · Money · Stock · Team,
 * plus Account (behind the "E" button). The tab bar, the back pill, Search and the
 * section pages all read this one list, so a page has one name and one place.
 */
export type Section = "today" | "money" | "stock" | "team" | "account";

export type PageEntry = {
  href: string;
  en: string;
  ar: string;
  section: Section;
  group: { en: string; ar: string };
  icon: IconName;
  color: string;
  /** Other paths that belong to this page. */
  also?: string[];
  /** Only this exact path, not the pages under it. */
  exact?: boolean;
};

export type IconName =
  | "today" | "alert" | "check" | "sparkle" | "sales" | "orders" | "doc" | "pos" | "store" | "repeat" | "owed"
  | "pnl" | "pie" | "vat" | "cash" | "box" | "list" | "trash" | "cup" | "tag" | "people" | "clock" | "folder"
  | "wallet" | "tree" | "shield" | "bell" | "globe" | "calendar" | "search";

export const ICON: Record<IconName, string> = {
  today: "M4 20V12 M10 20V7 M16 20v-9 M22 20H2",
  alert: "M12 5v9 M12 19h.01",
  check: "M5 12.5l4.5 4.5L19 7.5",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z",
  sales: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  orders: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
  doc: "M7 3h7l4 4v14H7z M14 3v4h4 M10 12h5 M10 15.5h5",
  pos: "M7 3h10v6H7z M5 9h14a1 1 0 0 1 1 1v8H4v-8a1 1 0 0 1 1-1z M8 14h8",
  store: "M3 9l2-5h14l2 5 M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z M5 13v7h14v-7 M10 20v-4h4v4",
  repeat: "M4 12a8 8 0 0 1 13.7-5.7L20 8 M20 4v4h-4 M20 12a8 8 0 0 1-13.7 5.7L4 16 M4 20v-4h4",
  owed: "M12 3v18 M16.5 7.5c0-1.9-2-3-4.5-3s-4.5 1.1-4.5 3 2 2.7 4.5 3 4.5 1.3 4.5 3.2-2 3.3-4.5 3.3-4.5-1.3-4.5-3.3",
  pnl: "M3 17l6-6 4 4 8-8 M15 7h6v6",
  pie: "M12 3a9 9 0 1 0 9 9h-9z M14 3.3A9 9 0 0 1 20.7 10H14z",
  vat: "M19 5L5 19 M7 9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M17 19.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  cash: "M3 7h18v10H3z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M6 10v.01 M18 14v.01",
  box: "M12 2.5l8.5 4.5v10L12 21.5 3.5 17V7z M3.5 7L12 11.5 20.5 7 M12 11.5v10",
  list: "M9 6h11 M9 12h11 M9 18h11 M4 6l1 1 2-2 M4 12l1 1 2-2 M4 18l1 1 2-2",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6",
  cup: "M5 8h12v5a6 6 0 0 1-12 0z M17 9h2a2 2 0 0 1 0 4h-2 M8 2v3 M12 2v3",
  tag: "M3 12V4h8l10 10-8 8z M7.5 8.5h.01",
  people: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21c0-4 3-7 7-7s7 3 7 7 M16 3.5a4 4 0 0 1 0 7.5 M22 21c0-3-1.7-5.5-4.5-6.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  folder: "M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  wallet: "M4 7a2 2 0 0 1 2-2h12v4 M4 7v11a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z M16 14.5h.01",
  tree: "M4 5h16 M4 12h16 M4 19h10",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 21h4",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z",
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
  search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M15.5 15.5 20.5 20.5",
};

export const COLOR = {
  blue: "#1E6EF4",
  green: "#008932",
  orange: "#C55300",
  red: "#E9152D",
  brown: "#956D51",
  teal: "#008198",
  purple: "#6E5BD1",
  grey: "#6C6C70",
} as const;

const G = {
  today: { en: "Today", ar: "اليوم" },
  sales: { en: "Sales", ar: "المبيعات" },
  costs: { en: "Costs", ar: "التكاليف" },
  reports: { en: "Reports", ar: "التقارير" },
  stock: { en: "Stock", ar: "المخزون" },
  menu: { en: "Menu", ar: "القائمة" },
  people: { en: "People", ar: "الفريق" },
  you: { en: "You", ar: "أنت" },
  admin: { en: "Admin", ar: "الإدارة" },
};

export const PAGES: PageEntry[] = [
  { href: "/owner", en: "Today", ar: "اليوم", section: "today", group: G.today, icon: "today", color: COLOR.blue, exact: true },
  { href: "/owner/needs-you", en: "Needs you", ar: "يحتاجك", section: "today", group: G.today, icon: "alert", color: COLOR.orange },
  { href: "/owner/review", en: "Approvals", ar: "الموافقات", section: "today", group: G.today, icon: "check", color: COLOR.green },
  { href: "/owner/assistant", en: "Strow AI", ar: "Strow AI", section: "today", group: G.today, icon: "sparkle", color: COLOR.blue, exact: true },

  { href: "/owner/sales", en: "Sales overview", ar: "نظرة عامة على المبيعات", section: "money", group: G.sales, icon: "sales", color: COLOR.blue, also: ["/owner/insights"] },
  { href: "/owner/orders", en: "Orders", ar: "الطلبات", section: "money", group: G.sales, icon: "orders", color: COLOR.blue },
  { href: "/owner/closings", en: "Closings", ar: "الإقفالات", section: "money", group: G.sales, icon: "doc", color: COLOR.blue },
  { href: "/owner/pos-reports", en: "POS reports", ar: "تقارير نقاط البيع", section: "money", group: G.sales, icon: "pos", color: COLOR.blue },
  { href: "/owner/expenses", en: "Bills", ar: "الفواتير", section: "money", group: G.costs, icon: "doc", color: COLOR.orange },
  { href: "/owner/suppliers", en: "Vendors", ar: "الموردون", section: "money", group: G.costs, icon: "store", color: COLOR.orange },
  { href: "/owner/fixed-costs", en: "Recurring costs", ar: "المصاريف الثابتة", section: "money", group: G.costs, icon: "repeat", color: COLOR.orange },
  { href: "/owner/liabilities", en: "Money owed", ar: "المبالغ المستحقة", section: "money", group: G.costs, icon: "owed", color: COLOR.orange },
  { href: "/owner/reports", en: "Profit & loss", ar: "الأرباح والخسائر", section: "money", group: G.reports, icon: "pnl", color: COLOR.purple, exact: true, also: ["/owner/reports/monthly-pnl"] },
  { href: "/owner/reports/category-breakdown", en: "Spending by category", ar: "الإنفاق حسب الفئة", section: "money", group: G.reports, icon: "pie", color: COLOR.purple },
  { href: "/owner/reports/vat", en: "VAT", ar: "ضريبة القيمة المضافة", section: "money", group: G.reports, icon: "vat", color: COLOR.purple },

  { href: "/owner/stock", en: "Counts", ar: "الجرد", section: "stock", group: G.stock, icon: "box", color: COLOR.brown, exact: true },
  { href: "/owner/stock/lists", en: "Count lists", ar: "قوائم الجرد", section: "stock", group: G.stock, icon: "list", color: COLOR.brown },
  { href: "/owner/stock/waste", en: "Waste check", ar: "فحص الهدر", section: "stock", group: G.stock, icon: "trash", color: COLOR.brown },
  { href: "/owner/recipes", en: "Recipes", ar: "الوصفات", section: "stock", group: G.menu, icon: "cup", color: COLOR.green },
  { href: "/owner/items", en: "Items", ar: "الأصناف", section: "stock", group: G.menu, icon: "tag", color: COLOR.green },

  { href: "/owner/baristas", en: "Staff", ar: "الموظفون", section: "team", group: G.people, icon: "people", color: COLOR.teal },
  { href: "/owner/attendance", en: "Attendance", ar: "الحضور", section: "team", group: G.people, icon: "clock", color: COLOR.teal, exact: true, also: ["/owner/attendance/log"] },
  { href: "/owner/attendance/reports", en: "Staff records", ar: "سجلات الموظفين", section: "team", group: G.people, icon: "folder", color: COLOR.teal },

  { href: "/owner/finance", en: "Personal finance", ar: "المالية الشخصية", section: "account", group: G.you, icon: "wallet", color: COLOR.green },
  { href: "/owner/categories", en: "Chart of accounts", ar: "دليل الحسابات", section: "account", group: G.admin, icon: "tree", color: COLOR.grey },
  { href: "/owner/assistant/activity", en: "Strow AI activity", ar: "نشاط الذكاء الاصطناعي", section: "account", group: G.admin, icon: "sparkle", color: COLOR.grey },
  { href: "/owner/audit", en: "Audit trail", ar: "سجل التدقيق", section: "account", group: G.admin, icon: "shield", color: COLOR.grey },
];

/** The section roots: what each tab (and the back pill) opens. */
export const HUB: Record<Section, { href: string; en: string; ar: string }> = {
  today: { href: "/owner", en: "Today", ar: "اليوم" },
  money: { href: "/owner/hub/money", en: "Money", ar: "المال" },
  stock: { href: "/owner/hub/stock", en: "Stock", ar: "المخزون" },
  team: { href: "/owner/hub/team", en: "Team", ar: "الفريق" },
  account: { href: "/owner/account", en: "Account", ar: "الحساب" },
};

const under = (p: string, x: string) => p === x || p.startsWith(`${x}/`);

export function pageMatches(path: string, e: PageEntry): boolean {
  return (e.exact ? path === e.href : under(path, e.href)) || (e.also ?? []).some((x) => under(path, x));
}

/** Which section a path belongs to (the most specific page wins). */
export function sectionOf(path: string): Section | null {
  for (const [s, h] of Object.entries(HUB) as [Section, { href: string }][]) if (s !== "today" && under(path, h.href)) return s;
  const hits = PAGES.filter((e) => pageMatches(path, e) || (!e.exact && under(path, e.href)));
  if (!hits.length) return null;
  hits.sort((a, b) => b.href.length - a.href.length);
  return hits[0].section;
}

/** True on the page a tab opens (no back pill there). */
export function isSectionRoot(path: string): boolean {
  return path === "/owner" || path === "/owner/search" || Object.values(HUB).some((h) => h.href === path);
}

export function pagesIn(section: Section): { group: { en: string; ar: string }; pages: PageEntry[] }[] {
  const out: { group: { en: string; ar: string }; pages: PageEntry[] }[] = [];
  for (const p of PAGES.filter((x) => x.section === section)) {
    const g = out.find((o) => o.group.en === p.group.en);
    if (g) g.pages.push(p);
    else out.push({ group: p.group, pages: [p] });
  }
  return out;
}
