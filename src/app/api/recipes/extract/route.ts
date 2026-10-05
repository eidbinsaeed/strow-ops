import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getOwnerSession } from "@/lib/auth/owner-session";
import { createServiceClient } from "@/lib/supabase/server";
import { uploadReceiptPhoto } from "@/lib/drive/upload";
import { addUsage, emptyUsage, logUsage } from "@/lib/ai/usage";
import { todayDubai } from "@/lib/dates";
import { NON_INGREDIENT_KINDS, normUom, type Conf, type ExtractedLine, type ExtractedRecipe } from "@/lib/recipes";

export const runtime = "nodejs";
export const maxDuration = 300; // a full notebook page of recipes is a long read

// Handwriting is the hard case, so the strongest everyday model reads it,
// with the bill reader's model as fallback.
const MODELS = [process.env.STROW_AI_MODEL || "claude-sonnet-5", "claude-sonnet-4-6"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
const PDF = "application/pdf";
const MAX_TEXT = 12000;

const SYSTEM_PROMPT = `You read café recipes for Qave Cafe in Al Ain, UAE, and turn them into structured recipes so the app can cost every drink and dish from real purchase prices.

The input is usually a photo of handwritten recipe cards or a notebook page; sometimes typed or pasted text.

== READING ==
- Handwriting may be messy, in English, Arabic or both. Numbers may be Western (0-9) or Arabic-Indic (٠١٢٣٤٥٦٧٨٩): always output Western digits.
- A page can hold several recipes: return every recipe you can see, in reading order. Never merge two recipes into one.
- If one recipe gives several sizes or versions (8oz / 12oz / 16oz, small / large, hot / iced) with different amounts, return ONE recipe per size or version and put it in the name, e.g. "Spanish Latte 12oz", "Spanish Latte Iced".
- name: the drink or dish in clean English title case, keeping the café's own names (e.g. "Sweet Melon V60"). If the card is only in Arabic, translate the name and keep the original in name_as_written. Reuse the exact name of an EXISTING MENU ITEM when it is clearly the same drink.
- section: a short menu group. Use one of the EXISTING SECTIONS when it fits, else a short new one (Hot coffee, Iced coffee, V60, Matcha, Tea, Smoothies, Bowls, Desserts, Bakery, Other).
- price: only if a selling price is written for that item (AED, incl. VAT). Never invent a price — null otherwise.
- method: preparation steps if written, as short English lines separated by newlines; else null.

== INGREDIENTS ==
For every ingredient line on the card:
- as_written: the line as written (digits normalised), e.g. "3 pumps vanilla".
- name: clean English ingredient name, e.g. "Vanilla syrup".
- inventory_item_id: the exact id of the matching KNOWN INVENTORY ITEM — the same product, or the obvious stock item for a generic word: "milk" → the full-cream milk the café buys most; "espresso" / "coffee" / "shot" → the espresso beans bought most often; "oat milk" → the oat milk item. "bought N×" tells you which item is actually in use. null when nothing fits.
- qty + uom: always ONE of g, ml, pcs, kg, L. Prefer the unit the matched item is bought in: bought per kg → g, per L → ml, per pcs → pcs.
  Convert café units, and say how in converted_from:
  - espresso shot: 9 g coffee per single shot, 18 g per double — unless the card gives grams.
  - pump of syrup or sauce: 10 ml per pump.
  - tablespoon: 15 ml liquid, 8 g powder. teaspoon: 5 ml liquid, 3 g powder.
  - scoop: ice cream 60 g; powder (matcha, frappe base, protein) 20 g — unless written.
  - oz of a liquid: × 29.57 ml. But "12oz" next to a drink name or a cup is the CUP SIZE, not an ingredient.
  - a counted fruit when the item is bought per kg: use a typical weight (banana 120 g, strawberry 15 g, mango 300 g, lemon 100 g, lime 50 g).
  - a cup, lid, straw or sleeve the card mentions → pcs of the matching packaging item.
- converted_from: a short note when you converted or estimated ("3 pumps × 10 ml", "1 banana ≈ 120 g", "not written — estimated"); null when the card already gives g / ml / pcs.
- free: true for ice, tap water and hot water (no purchase cost); else false.
- confidence: "high" = clearly written and clearly matched; "medium" = hard to read, converted or estimated, or an uncertain item match; "low" = guessed.
- An amount that isn't written ("milk to top up"): estimate a sensible amount for the cup size, confidence "low", converted_from "not written — estimated".
Do not add ingredients that are not on the card — except: when the card names a cup size (e.g. "12oz iced"), you may add the matching cup as 1 pcs with confidence "medium" and converted_from "cup size on card".

note: one short plain sentence if part of the page is unreadable or cut off; else null.

Deliver the result by calling record_recipes once. Put nothing outside the tool call.`;

const S = { type: ["string", "null"] };
const CONF = { type: "string", enum: ["high", "medium", "low"] };
const SCHEMA = {
  type: "object" as const,
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          name_as_written: S,
          section: S,
          price: { type: ["number", "null"] },
          method: S,
          confidence: CONF,
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                as_written: S,
                name: { type: "string" },
                inventory_item_id: S,
                qty: { type: ["number", "null"] },
                uom: { type: ["string", "null"], enum: ["g", "ml", "pcs", "kg", "L", null] },
                converted_from: S,
                free: { type: "boolean" },
                confidence: CONF,
              },
              required: ["as_written", "name", "inventory_item_id", "qty", "uom", "converted_from", "free", "confidence"],
            },
          },
        },
        required: ["name", "name_as_written", "section", "price", "method", "confidence", "ingredients"],
      },
    },
    note: S,
  },
  required: ["recipes", "note"],
};

type ItemRow = { id: string; name: string; kind: string | null; unit: string | null; default_unit_size: number | null; default_size_uom: string | null };
type CostRow = { inventory_item_id: string; base_uom: string | null; buys: number | null };
type MenuRow = { id: string; name: string; section: string | null };

function contextBlock(items: ItemRow[], costs: CostRow[], menu: MenuRow[]): string {
  const cost = new Map(costs.map((c) => [c.inventory_item_id, c]));
  const itemList = items
    .filter((i) => !NON_INGREDIENT_KINDS.has(i.kind ?? ""))
    .map((i) => {
      const c = cost.get(i.id);
      const bought = c?.base_uom ? `bought per ${c.base_uom}, ${c.buys ?? 1}×` : "no bill yet";
      const pack = i.default_unit_size && i.default_size_uom ? ` | pack ${i.default_unit_size} ${i.default_size_uom}` : i.unit ? ` | unit ${i.unit}` : "";
      return `- id=${i.id} | ${i.name} | ${i.kind ?? "other"} | ${bought}${pack}`;
    })
    .join("\n");
  const menuList = menu.length ? menu.map((m) => `- ${m.name}${m.section ? ` (${m.section})` : ""}`).join("\n") : "- (none yet)";
  const sections = [...new Set(menu.map((m) => m.section).filter(Boolean))].join(", ") || "(none yet)";
  return `== KNOWN INVENTORY ITEMS (match ingredients to these by id) ==
${itemList || "- (none yet)"}

== EXISTING MENU ITEMS ==
${menuList}

== EXISTING SECTIONS ==
${sections}`;
}

const conf = (v: unknown): Conf => (v === "high" || v === "medium" || v === "low" ? v : "low");
const str = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

function cleanResult(raw: unknown, itemIds: Set<string>, menu: MenuRow[]): { recipes: ExtractedRecipe[]; note: string | null } {
  const r = (raw ?? {}) as { recipes?: unknown; note?: unknown };
  const byName = new Map(menu.map((m) => [m.name.trim().toLowerCase(), m.id]));
  const recipes: ExtractedRecipe[] = [];
  for (const x of Array.isArray(r.recipes) ? r.recipes : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const name = str(o.name, 120);
    if (!name) continue;
    const lines: ExtractedLine[] = [];
    for (const y of Array.isArray(o.ingredients) ? o.ingredients : []) {
      const l = (y ?? {}) as Record<string, unknown>;
      const lname = str(l.name, 120) ?? str(l.as_written, 120);
      if (!lname) continue;
      const id = typeof l.inventory_item_id === "string" && itemIds.has(l.inventory_item_id) ? l.inventory_item_id : null;
      const qty = typeof l.qty === "number" && l.qty > 0 && l.qty < 100000 ? Math.round(l.qty * 1000) / 1000 : null;
      const uom = normUom(l.uom);
      let c = conf(l.confidence);
      if (qty == null || uom == null) c = "low";
      lines.push({
        as_written: str(l.as_written, 300),
        name: lname,
        inventory_item_id: id,
        qty,
        uom,
        converted_from: str(l.converted_from, 160),
        free: l.free === true,
        confidence: c,
      });
    }
    const price = typeof o.price === "number" && o.price > 0 && o.price < 10000 ? Math.round(o.price * 100) / 100 : null;
    recipes.push({
      name,
      name_as_written: str(o.name_as_written, 160),
      section: str(o.section, 60),
      price,
      method: str(o.method, 4000),
      confidence: conf(o.confidence),
      existing_id: byName.get(name.toLowerCase()) ?? null,
      lines,
    });
  }
  return { recipes, note: str(r.note, 300) };
}

export async function POST(request: Request) {
  if (!(await getOwnerSession())) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  let body: { image?: unknown; mediaType?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const image = typeof body.image === "string" ? body.image : "";
  const mediaType = typeof body.mediaType === "string" ? body.mediaType : "";
  const isPdf = mediaType === PDF;
  if (!text && !image) return NextResponse.json({ ok: false, error: "Send a photo or some text." }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ ok: false, error: "That text is too long — paste fewer recipes at a time." }, { status: 400 });
  if (image && !isPdf && !(IMAGE_TYPES as readonly string[]).includes(mediaType)) {
    return NextResponse.json({ ok: false, error: "Unsupported photo type." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });

  const db = createServiceClient();
  const { data: loc } = await db.from("locations").select("id, slug").eq("slug", "qave_main").maybeSingle();
  if (!loc) return NextResponse.json({ ok: false, error: "Location not found" }, { status: 500 });

  const [itemsRes, costsRes, menuRes] = await Promise.all([
    db.from("inventory_items").select("id, name, kind, unit, default_unit_size, default_size_uom").eq("location_id", loc.id).eq("is_active", true).order("name"),
    db.from("v_item_unit_cost").select("inventory_item_id, base_uom, buys"),
    db.from("menu_items").select("id, name, section").eq("location_id", loc.id),
  ]);
  if (menuRes.error) {
    return NextResponse.json({ ok: false, error: "Recipes are not set up in the database yet (migration 0018)." }, { status: 500 });
  }
  const items = (itemsRes.data ?? []) as ItemRow[];
  const menu = (menuRes.data ?? []) as MenuRow[];
  const context = contextBlock(items, (costsRes.data ?? []) as CostRow[], menu);

  // Keep the original photo (Drive, /Strow/<location>/<YYYY-MM>/recipes/) while the AI reads it.
  const today = todayDubai();
  const upload = image
    ? uploadReceiptPhoto({ imageDataUrl: image, mediaType: mediaType || "image/jpeg", locationSlug: loc.slug, kind: "recipes", date: today, entityId: crypto.randomUUID() })
    : Promise.resolve(null);

  const data = image.includes(",") ? image.split(",")[1] : image;
  const content: Anthropic.MessageParam["content"] = image
    ? [
        isPdf
          ? ({ type: "document", source: { type: "base64", media_type: PDF, data } } as unknown as Anthropic.ImageBlockParam)
          : { type: "image", source: { type: "base64", media_type: mediaType as (typeof IMAGE_TYPES)[number], data } },
        { type: "text", text: `Read every recipe on this ${isPdf ? "document" : "photo"}.\n\n${context}` },
      ]
    : [{ type: "text", text: `Read every recipe in this text:\n"""\n${text}\n"""\n\n${context}` }];

  const client = new Anthropic({ apiKey });
  let raw: unknown = null;
  let lastError = "";
  for (const model of MODELS) {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: [{ name: "record_recipes", description: "Record the recipes read from the input, following the instructions.", input_schema: SCHEMA }],
        tool_choice: { type: "tool", name: "record_recipes" },
        messages: [{ role: "user", content }],
      });
      const u = emptyUsage();
      addUsage(u, (res as unknown as { usage?: unknown }).usage);
      await logUsage(image ? "photo-recipe" : "text-recipe", model, u);
      const block = res.content.find((b) => b.type === "tool_use");
      raw = block && block.type === "tool_use" ? block.input : null;
      lastError = "";
      break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      const status = (e as { status?: number }).status;
      if (status === 404 || /not_found|model/i.test(lastError)) continue;
      break;
    }
  }
  const photo = await upload;

  if (lastError) {
    const msg = /credit balance/i.test(lastError) ? "The AI account is out of credit." : "The AI could not read that right now. Try again.";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  const { recipes, note } = cleanResult(raw, new Set(items.map((i) => i.id)), menu);
  return NextResponse.json({
    ok: true,
    recipes,
    note,
    photo: photo ? { url: photo.viewUrl, path: photo.displayPath } : null,
  });
}
