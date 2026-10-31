/**
 * Photos from the web, for stock items and vendors.
 *
 *  - Item: the AI searches the web (Anthropic web search) for the exact product page on a UAE
 *    shop or the brand's site — or, for fresh produce and plain ingredients, the Wikipedia article —
 *    and names up to three pages. The server opens each page and takes its main picture
 *    (og:image), so the photo is the product the page sells, not a guess.
 *  - Vendor: its own website (from its email domain when it has one, else a web search), and the
 *    logo on it (app icon, logo image, or the page picture).
 *
 * The server returns the image as a data URL; the owner's browser shrinks it to ≤ 360 px and
 * saves it (src/lib/item-photo.ts, src/lib/supplier-logo.ts). Each item / vendor is looked at
 * once (photo_checked_at / logo_web_checked_at), at about 2–4 US cents with the searches.
 *
 * Fetching pages the model names: http(s) only, no IP addresses or local names, ≤ 3 redirects,
 * 8 s and a few MB at most.
 */
import { lookup } from "node:dns/promises";
import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { createServiceClient } from "@/lib/supabase/server";
import { addUsage, emptyUsage, logUsage, type Usage } from "./usage";

const MODELS = [process.env.STROW_AI_MODEL || "claude-sonnet-5", "claude-sonnet-4-6"];
const UA = "Mozilla/5.0 (compatible; StrowOps/1.0; +https://strow.app)";
const IMG_TYPES = /^image\/(jpeg|jpg|png|webp)\b/i;
const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|aol|proton|protonmail|gmx|mail|yandex|msn)\./i;

export type WebImage =
  | { status: "found"; dataUrl: string; page: string; exact: boolean }
  | { status: "none"; reason: string; tried?: string[] }
  | { status: "error"; reason: string };

type Page = { url: string; exact: boolean };

// ─── safe fetching ────────────────────────────────────────────────────────────

export function safeUrl(raw: string, base?: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim().replace(/&amp;/g, "&"), base);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|intranet)$/.test(h)) return null;
  if (u.username || u.password) return null;
  return u;
}

/** A name that resolves to a private, loopback or link-local address is refused (no peeking inside networks). */
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) {
    const [a, b] = v.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

async function publicHost(u: URL): Promise<boolean> {
  try {
    const addrs = await lookup(u.hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u.slice(0, 40);
  }
};

async function safeFetch(raw: string, maxBytes: number, accept: string, log?: string[]): Promise<{ url: string; type: string; bytes: Buffer } | null> {
  let url = safeUrl(raw);
  if (!url) log?.push(`${hostOf(raw)}: bad address`);
  for (let hop = 0; url && hop < 4; hop++) {
    if (!(await publicHost(url))) {
      log?.push(`${url.hostname}: not a public address`);
      return null;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        url = loc ? safeUrl(loc, url.toString()) : null;
        continue;
      }
      if (!res.ok || !res.body) {
        log?.push(`${url.hostname}: HTTP ${res.status}`);
        return null;
      }
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > maxBytes) {
        log?.push(`${url.hostname}: too big`);
        return null;
      }
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) {
          await reader.cancel();
          log?.push(`${url.hostname}: too big`);
          return null;
        }
        parts.push(value);
      }
      return { url: url.toString(), type: res.headers.get("content-type") ?? "", bytes: Buffer.concat(parts) };
    } catch (e) {
      log?.push(`${url?.hostname ?? hostOf(raw)}: ${(e as Error)?.name === "AbortError" ? "timed out" : "unreachable"}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function fetchImage(raw: string, allowSvg: boolean, log?: string[]): Promise<string | null> {
  const got = await safeFetch(raw, 4_000_000, "image/webp,image/png,image/jpeg,image/*;q=0.8", log);
  if (!got) return null;
  if (got.bytes.length < 600) {
    log?.push(`${hostOf(got.url)}: picture too small`);
    return null;
  }
  let type = got.type.split(";")[0].trim().toLowerCase();
  if (type === "image/jpg") type = "image/jpeg";
  if (IMG_TYPES.test(type)) return `data:${type};base64,${got.bytes.toString("base64")}`;
  if (allowSvg && (type === "image/svg+xml" || /\.svg(\?|$)/i.test(got.url)) && got.bytes.length < 400_000) {
    const text = got.bytes.toString("utf8");
    if (/<svg[\s>]/i.test(text) && !/<script/i.test(text)) return `data:image/svg+xml;base64,${got.bytes.toString("base64")}`;
  }
  log?.push(`${hostOf(got.url)}: not a usable picture (${type || "unknown type"})`);
  return null;
}

// ─── reading a page ───────────────────────────────────────────────────────────

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : null;
}

/** The pictures a page offers, best first: for a product its og:image; for a vendor its logo / app icon. */
export function pagePictures(html: string, pageUrl: string, kind: "item" | "logo"): string[] {
  const head = html.slice(0, 400_000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const imgs = [...head.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  const meta = (key: string) =>
    metas.filter((t) => (attr(t, "property") ?? attr(t, "name") ?? "").toLowerCase() === key).map((t) => attr(t, "content")).filter((v): v is string => !!v);
  const og = [...meta("og:image:secure_url"), ...meta("og:image"), ...meta("twitter:image"), ...meta("twitter:image:src")];
  const out: string[] = [];
  if (kind === "item") {
    // Shop pages describe the product in JSON-LD; its "image" is the pack shot.
    const ld = [...head.matchAll(/"image"\s*:\s*(?:\[\s*)?"(https?:[^"\s]+)"/gi)].map((m) => m[1].replace(/\\\//g, "/"));
    out.push(...og, ...ld.slice(0, 2), ...links.filter((t) => (attr(t, "rel") ?? "").toLowerCase() === "image_src").map((t) => attr(t, "href") ?? ""));
  } else {
    const icons = links
      .filter((t) => /apple-touch-icon|icon/i.test(attr(t, "rel") ?? ""))
      .map((t) => ({ href: attr(t, "href") ?? "", size: Number(/(\d+)x\d+/.exec(attr(t, "sizes") ?? "")?.[1] ?? (/apple-touch/i.test(attr(t, "rel") ?? "") ? 180 : /\.svg/i.test(attr(t, "href") ?? "") ? 256 : 16)) }))
      .filter((i) => i.href && i.size >= 96)
      .sort((a, b) => b.size - a.size)
      .map((i) => i.href);
    const logoImgs = imgs
      .filter((t) => /logo/i.test(`${attr(t, "src") ?? ""} ${attr(t, "alt") ?? ""} ${attr(t, "class") ?? ""} ${attr(t, "id") ?? ""}`))
      .map((t) => attr(t, "src") ?? attr(t, "data-src") ?? "")
      .filter((s) => s && !s.startsWith("data:"));
    out.push(...logoImgs.slice(0, 2), ...icons, ...og);
  }
  const seen = new Set<string>();
  return out
    .map((s) => safeUrl(s, pageUrl)?.toString() ?? "")
    .filter((s) => s && !seen.has(s) && (seen.add(s), true))
    .slice(0, 5);
}

/** Shops that turn away anything but a person's browser (checked 1 Nov 2026): not worth the wait. */
const BLOCKS_APPS = /(^|\.)(amazon\.[a-z.]+|carrefouruae\.com|spinneys\.com)$/i;
/** Pages whose picture is a profile or company banner, never the product. */
const NOT_PRODUCT = /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|youtube\.com|pinterest\.[a-z.]+)$/i;

async function pictureFrom(page: Page, kind: "item" | "logo", log?: string[]): Promise<string | null> {
  if (BLOCKS_APPS.test(hostOf(page.url))) {
    log?.push(`${hostOf(page.url)}: skipped (blocks apps)`);
    return null;
  }
  if (kind === "item" && NOT_PRODUCT.test(hostOf(page.url))) {
    log?.push(`${hostOf(page.url)}: skipped (social page)`);
    return null;
  }
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(page.url) || (kind === "logo" && /\.svg(\?|$)/i.test(page.url))) return fetchImage(page.url, kind === "logo", log);
  const got = await safeFetch(page.url, 3_000_000, "text/html,application/xhtml+xml", log);
  if (!got) return null;
  if (!/html/i.test(got.type)) {
    log?.push(`${hostOf(got.url)}: not a web page`);
    return null;
  }
  const pics = pagePictures(got.bytes.toString("utf8"), got.url, kind);
  if (!pics.length) log?.push(`${hostOf(got.url)}: no picture on the page`);
  for (const src of pics) {
    const img = await fetchImage(src, kind === "logo", log);
    if (img) return img;
  }
  return null;
}

// ─── open sources that welcome apps ───────────────────────────────────────────

/** Open Food Facts: crowd-sourced pack shots of grocery products (free to reuse). By barcode when known, else by name. */
async function openFoodFactsImage(query: string, barcode: string | null, log?: string[]): Promise<string | null> {
  const tryList = async (raw: string, pick: (j: unknown) => string[]): Promise<string | null> => {
    const got = await safeFetch(raw, 2_000_000, "application/json", log);
    if (!got) return null;
    let srcs: string[] = [];
    try {
      srcs = pick(JSON.parse(got.bytes.toString("utf8")));
    } catch {
      log?.push("openfoodfacts: bad answer");
      return null;
    }
    for (const src of srcs.slice(0, 3)) {
      const img = await fetchImage(src, false, log);
      if (img) return img;
    }
    return null;
  };
  type P = { image_front_url?: string; image_url?: string; product_name?: string; brands?: string | string[] };
  // A name search must be about the same thing: the hit shares a real word with what was asked for.
  const words = (t: string) => new Set(t.toLowerCase().split(/[^a-z\u0600-\u06ff]+/).filter((w) => w.length >= 4));
  const asked = words(query);
  const relevant = (p: P) => {
    const got = words(`${p.product_name ?? ""} ${Array.isArray(p.brands) ? p.brands.join(" ") : p.brands ?? ""}`);
    return [...asked].some((w) => got.has(w));
  };
  const srcOf = (list: P[] | undefined, check = true) =>
    (list ?? []).filter((p) => !check || relevant(p)).map((p) => p.image_front_url || p.image_url || "").filter(Boolean);
  if (barcode && /^\d{8,14}$/.test(barcode)) {
    const img = await tryList(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=image_front_url,image_url`, (j) => srcOf([(j as { product?: P }).product ?? {}], false));
    if (img) return img;
  }
  const q = encodeURIComponent(query);
  const viaSearch = await tryList(`https://search.openfoodfacts.org/search?q=${q}&page_size=5&fields=product_name,brands,image_front_url,image_url`, (j) => srcOf((j as { hits?: P[] }).hits));
  if (viaSearch) return viaSearch;
  const viaLegacy = await tryList(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=5&fields=product_name,brands,image_front_url,image_url`,
    (j) => srcOf((j as { products?: P[] }).products),
  );
  if (!viaLegacy) log?.push("openfoodfacts: no match with a photo");
  return viaLegacy;
}

/** Wikipedia: the article's lead picture (fresh produce, plain ingredients, generic things). */
async function wikipediaImage(title: string, log?: string[]): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.trim().replace(/ /g, "_"))}`;
  const got = await safeFetch(url, 500_000, "application/json", log);
  if (!got) return null;
  try {
    const j = JSON.parse(got.bytes.toString("utf8")) as { thumbnail?: { source?: string }; originalimage?: { source?: string } };
    const thumb = j.thumbnail?.source?.replace(/\/\d+px-/, "/640px-");
    for (const src of [thumb, j.originalimage?.source].filter((x): x is string => !!x)) {
      const img = await fetchImage(src, false, log);
      if (img) return img;
    }
    log?.push(`wikipedia: no picture for ${title}`);
  } catch {
    log?.push("wikipedia: bad answer");
  }
  return null;
}

// ─── asking the AI where to look ─────────────────────────────────────────────

function webSearchTool(): Tool {
  return {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 4,
    // No user_location: web search doesn't accept the UAE (AE) as a location; the prompt says where to look instead.
  } as unknown as Tool;
}

type Plan = { pages: Page[]; product: string | null; wikipedia: string | null; barcode: string | null };

function parsePlan(text: string, seen: string[]): Plan {
  const a = text.indexOf("{");
  const z = text.lastIndexOf("}");
  let plan: Plan = { pages: [], product: null, wikipedia: null, barcode: null };
  try {
    const j = a >= 0 && z > a ? (JSON.parse(text.slice(a, z + 1)) as { pages?: { url?: unknown; exact?: unknown }[]; product?: unknown; wikipedia?: unknown; barcode?: unknown }) : {};
    plan = {
      pages: (j.pages ?? []).map((p) => ({ url: String(p.url ?? ""), exact: p.exact === true })).filter((p) => safeUrl(p.url)),
      product: typeof j.product === "string" && j.product.trim() ? j.product.trim().slice(0, 120) : null,
      wikipedia: typeof j.wikipedia === "string" && j.wikipedia.trim() ? j.wikipedia.trim().slice(0, 120) : null,
      barcode: typeof j.barcode === "string" || typeof j.barcode === "number" ? String(j.barcode).replace(/\D/g, "") || null : null,
    };
  } catch {
    /* keep the empty plan */
  }
  // The pages the search itself returned are the fallback, in the order it ranked them.
  for (const url of seen) if (plan.pages.length < 5 && !plan.pages.some((p) => p.url === url) && safeUrl(url)) plan.pages.push({ url, exact: false });
  plan.pages = plan.pages.slice(0, 5);
  return plan;
}

async function askPages(prompt: string, usage: Map<string, Usage>): Promise<Plan> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 50_000 });
  let lastErr: unknown = null;
  for (const model of MODELS) {
    try {
      const res = await client.messages.create({ model, max_tokens: 1500, tools: [webSearchTool()], messages: [{ role: "user", content: prompt }] });
      const u = usage.get(model) ?? emptyUsage();
      addUsage(u, (res as unknown as { usage?: unknown }).usage);
      usage.set(model, u);
      const blocks = res.content as unknown as { type: string; text?: string; content?: unknown }[];
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
      const seen: string[] = [];
      for (const b of blocks) {
        if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue;
        for (const r of b.content as { type?: string; url?: string }[]) if (r.type === "web_search_result" && r.url) seen.push(r.url);
      }
      return parsePlan(text, seen);
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number }).status;
      const msg = e instanceof Error ? e.message : String(e);
      if (status === 404 || (status === 400 && /model/i.test(msg) && !/web_search|tool/i.test(msg))) continue;
      throw e;
    }
  }
  throw lastErr ?? new Error("No model available");
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/web_search|web search/i.test(msg) && /(not enabled|disabled|not allowed|permission)/i.test(msg)) {
    return "Web search is switched off for the Anthropic account — turn it on in the Anthropic Console (organization settings), then try again.";
  }
  if (/credit balance|billing|quota/i.test(msg)) return "The AI account is out of credit.";
  // A request the API refuses outright will be refused for every item: say so once and stop.
  if (/invalid_request_error/i.test(msg)) return `Web search refused the request: ${(/"message":"([^"]+)"/.exec(msg)?.[1] ?? msg).slice(0, 160)}`;
  return msg.slice(0, 200);
}

// ─── items ────────────────────────────────────────────────────────────────────

export async function findItemPhoto(itemId: string): Promise<WebImage> {
  const db = createServiceClient();
  const [{ data: item }, { data: lines }] = await Promise.all([
    db.from("inventory_items").select("id, name, kind, unit, brand").eq("id", itemId).maybeSingle(),
    db
      .from("expense_line_items")
      .select("description, expenses(expense_date, suppliers(name))")
      .eq("inventory_item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);
  if (!item) return { status: "error", reason: "Item not found" };
  const it = item as { name: string; kind: string | null; unit: string | null; brand: string | null };
  type L = { description: string; expenses: { suppliers: { name: string } | { name: string }[] | null } | { suppliers: { name: string } | { name: string }[] | null }[] | null };
  const seenOn = ((lines ?? []) as unknown as L[]).map((l) => {
    const e = Array.isArray(l.expenses) ? l.expenses[0] : l.expenses;
    const s = e ? (Array.isArray(e.suppliers) ? e.suppliers[0]?.name : e.suppliers?.name) : null;
    return `"${l.description}"${s ? ` from ${s}` : ""}`;
  });
  const prompt = `Qave Cafe in Al Ain (UAE) wants a photo of each item it stocks, so staff recognise it on the stock count list.

Item: "${it.name}"${it.brand ? `, brand ${it.brand}` : ""}${it.kind ? `, kind ${it.kind}` : ""}${it.unit ? `, bought by the ${it.unit}` : ""}.
${seenOn.length ? `How it appears on the café's bills: ${seenOn.join("; ")}.` : ""}

Search the web and find the page of this exact product — same brand, same pack size. The brand's own website is best (its product page); then a UAE shop or wholesaler that sells it (luluhypermarket.com, kibsons.com, noon.com, talabat mart, a catering or packaging supplier). Skip amazon, carrefouruae.com and spinneys.com: their pages can't be read.
Also give: what the product is in a few words (brand, product, size) for a lookup in Open Food Facts; its barcode (EAN) if a page shows it; and ALWAYS the English Wikipedia article whose picture shows the same kind of thing (e.g. "Milk", "Banana", "Paper cup", "Whipped cream", "Oat milk"), used when no product photo can be had.

Reply with ONLY this JSON, best first, at most 3 pages, only URLs you saw in the search results:
{"pages": [{"url": "https://…", "exact": true}], "product": "Al Rawabi full cream milk 2 L", "barcode": null, "wikipedia": "Milk", "note": "one short line"}
exact = true only when the page is this exact product.`;
  const usage = new Map<string, Usage>();
  const tried: string[] = [];
  try {
    const plan = await askPages(prompt, usage);
    // 1. The product's own page (brand site, shop).
    for (const p of plan.pages.slice(0, 3)) {
      const dataUrl = await pictureFrom(p, "item", tried);
      if (dataUrl) return { status: "found", dataUrl, page: p.url, exact: p.exact };
    }
    // 2. Open Food Facts, for packaged groceries.
    const query = plan.product ?? `${it.brand ? `${it.brand} ` : ""}${it.name.replace(/[—–-].*$/, "").trim()}`;
    if (!["packaging", "cleaning", "service"].includes(it.kind ?? "")) {
      const off = await openFoodFactsImage(query, plan.barcode, tried);
      if (off) return { status: "found", dataUrl: off, page: `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}`, exact: false };
    }
    // 3. Wikipedia, for produce and plain things: a picture of the same kind of thing.
    const wiki = plan.wikipedia ?? it.name.split(/[—–(,-]/)[0].trim();
    if (wiki) {
      const img = await wikipediaImage(wiki, tried);
      if (img) return { status: "found", dataUrl: img, page: `https://en.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, "_"))}`, exact: false };
    }
    console.warn(`[photo-web] ${it.name}: nothing usable — ${tried.join(" | ")}`);
    return { status: "none", reason: plan.pages.length ? "No usable picture on the pages found" : "No page found", tried: tried.slice(0, 12) };
  } catch (e) {
    return { status: "error", reason: friendly(e) };
  } finally {
    for (const [model, u] of usage) await logUsage("photo-web", model, u);
  }
}

/** Active items with no photo that the finder hasn't looked at yet, most used first. */
export async function itemsWithoutPhoto(limit = 300): Promise<{ id: string; name: string }[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("inventory_items")
    .select("id, name, kind")
    .eq("is_active", true)
    .is("photo_path", null)
    .is("photo_checked_at", null)
    .order("name")
    .limit(limit);
  return ((data ?? []) as { id: string; name: string; kind: string | null }[])
    .filter((i) => i.kind !== "service" && !/\b(fee|charge|delivery|deposit|discount|service)\b/i.test(i.name))
    .map(({ id, name }) => ({ id, name }));
}

// ─── vendors ─────────────────────────────────────────────────────────────────

export async function findSupplierLogoOnWeb(supplierId: string): Promise<WebImage> {
  const db = createServiceClient();
  const { data } = await db.from("suppliers").select("id, name, trn, email, address, notes, categories(name)").eq("id", supplierId).maybeSingle();
  if (!data) return { status: "error", reason: "Vendor not found" };
  const s = data as { name: string; trn: string | null; email: string | null; address: string | null; notes: string | null; categories: { name: string } | { name: string }[] | null };
  const cat = Array.isArray(s.categories) ? s.categories[0]?.name : s.categories?.name;
  const markChecked = () => db.from("suppliers").update({ logo_web_checked_at: new Date().toISOString() }).eq("id", supplierId);

  // A company email domain is the vendor's own site: no search needed.
  const domain = (s.email ?? "").split("@")[1]?.trim().toLowerCase();
  if (domain && !FREE_MAIL.test(domain) && safeUrl(`https://${domain}`)) {
    const img = await pictureFrom({ url: `https://${domain}/`, exact: true }, "logo");
    if (img) {
      await markChecked();
      return { status: "found", dataUrl: img, page: `https://${domain}/`, exact: true };
    }
  }

  const prompt = `Find the official website of this supplier of Qave Cafe in Al Ain, UAE, so the café can show the supplier's logo.

Supplier: "${s.name}"${cat ? ` (${cat})` : ""}${s.trn ? `, UAE TRN ${s.trn}` : ""}${s.address ? `, ${s.address}` : ""}.

Search the web. Prefer the company's own website (its home page). For a big brand or an online shop (Noon, Amazon, Carrefour, Spinneys, Talabat…) that is its main site. If the supplier has no website, its official Instagram or Facebook page is the last choice. Don't pick a directory or a news article.

Reply with ONLY this JSON, best first, at most 3 pages, only URLs you saw in the search results:
{"pages": [{"url": "https://…", "exact": true}], "note": "one short line"}`;
  const usage = new Map<string, Usage>();
  try {
    const { pages } = await askPages(prompt, usage);
    for (const p of pages) {
      const dataUrl = await pictureFrom(p, "logo");
      if (dataUrl) {
        await markChecked();
        return { status: "found", dataUrl, page: p.url, exact: p.exact };
      }
    }
    await markChecked();
    return { status: "none", reason: pages.length ? "No logo on the pages found" : "No website found" };
  } catch (e) {
    return { status: "error", reason: friendly(e) };
  } finally {
    for (const [model, u] of usage) await logUsage("logo-web", model, u);
  }
}

/** Vendors with no logo that the web finder hasn't looked at yet. */
export async function suppliersWithoutLogo(): Promise<{ id: string; name: string }[]> {
  const db = createServiceClient();
  const { data } = await db.from("suppliers").select("id, name").is("logo_path", null).is("logo_web_checked_at", null).order("name");
  return (data ?? []) as { id: string; name: string }[];
}
