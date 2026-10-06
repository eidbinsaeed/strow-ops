"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { prepareBillFile } from "@/lib/image";
import { useLocale } from "@/components/owner/LocaleProvider";
import { PhotoViewer } from "@/components/ai/PhotoViewer";
import { CameraIcon, Sparkle } from "@/components/pulse/icons";
import { saveRecipes } from "./actions";
import {
  KIND_LABEL,
  KIND_ORDER,
  RECIPE_UOMS,
  baseOfUom,
  normUom,
  recipeUomFor,
  rt,
  type Conf,
  type ExtractResponse,
  type ExtractedRecipe,
  type ItemOption,
  type RecipeSaveInput,
  type RecipeSource,
  type RecipeUom,
} from "@/lib/recipes";

type DraftLine = { key: string; itemId: string; label: string; asWritten: string | null; qty: string; uom: RecipeUom; free: boolean; note: string | null; conf: Conf };
type Draft = {
  key: string;
  name: string;
  section: string;
  price: string;
  method: string;
  conf: Conf;
  source: RecipeSource;
  photo: { url: string; path: string } | null;
  preview: string | null;
  lines: DraftLine[];
  saved: { id: string; replaced: boolean } | null;
  error: string | null;
};
type Mode = "photo" | "text" | "manual";

let seq = 0;
const nextKey = () => `k${++seq}`;

export function RecipeIntake({ items, sections, existing }: { items: ItemOption[]; sections: string[]; existing: Record<string, string> }) {
  const locale = useLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("photo");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [saving, startSaving] = useTransition();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const byId = new Map(items.map((i) => [i.id, i]));

  function toDrafts(recipes: ExtractedRecipe[], source: RecipeSource, photo: Draft["photo"], preview: string | null): Draft[] {
    return recipes.map((r) => ({
      key: nextKey(),
      name: r.name,
      section: r.section ?? "",
      price: r.price != null ? String(r.price) : "",
      method: r.method ?? "",
      conf: r.confidence,
      source,
      photo,
      preview,
      saved: null,
      error: null,
      lines: r.lines.map((l) => {
        const item = l.inventory_item_id ? byId.get(l.inventory_item_id) : undefined;
        return {
          key: nextKey(),
          itemId: item ? item.id : "",
          label: item ? "" : l.name,
          asWritten: l.as_written,
          qty: l.qty != null ? String(l.qty) : "",
          uom: l.uom ?? recipeUomFor(item?.base),
          free: l.free,
          note: l.converted_from,
          conf: l.confidence,
        };
      }),
    }));
  }

  async function read(payload: { image?: string; mediaType?: string; text?: string }): Promise<ExtractResponse> {
    try {
      const res = await fetch("/api/recipes/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await res.json()) as ExtractResponse;
      return json;
    } catch {
      return { ok: false, error: locale === "ar" ? "تعذر الاتصال. حاول مرة أخرى." : "Connection problem. Try again." };
    }
  }

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setError(null);
    setNote(null);
    let found = 0;
    for (const [i, file] of files.entries()) {
      setBusy(files.length > 1 ? `${t("reading")} ${i + 1}/${files.length}` : t("reading"));
      try {
        const prepared = await prepareBillFile(file);
        const out = await read({ image: prepared.dataUrl, mediaType: prepared.mediaType });
        if (!out.ok) {
          setError(out.error);
          continue;
        }
        if (out.note) setNote(out.note);
        found += out.recipes.length;
        const preview = prepared.mediaType.startsWith("image/") ? prepared.dataUrl : null;
        setDrafts((d) => [...d, ...toDrafts(out.recipes, "photo", out.photo, preview)]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(null);
    if (!found) setError((e) => e ?? t("nothing_found"));
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  async function onReadText() {
    if (!text.trim()) return;
    setError(null);
    setNote(null);
    setBusy(t("reading"));
    const out = await read({ text });
    setBusy(null);
    if (!out.ok) return setError(out.error);
    if (out.note) setNote(out.note);
    if (!out.recipes.length) return setError(t("nothing_found"));
    setDrafts((d) => [...d, ...toDrafts(out.recipes, "text", null, null)]);
  }

  function addBlank() {
    setDrafts((d) => [
      ...d,
      { key: nextKey(), name: "", section: "", price: "", method: "", conf: "high", source: "manual", photo: null, preview: null, saved: null, error: null, lines: [blankLine()] },
    ]);
  }

  function update(key: string, fn: (d: Draft) => Draft) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? fn(d) : d)));
  }

  function toInput(d: Draft): RecipeSaveInput | string {
    const name = d.name.trim();
    if (!name) return locale === "ar" ? "اكتب اسم الوصفة." : "Give the recipe a name.";
    const lines = d.lines.filter((l) => l.itemId || l.label.trim() || l.qty);
    if (!lines.length) return locale === "ar" ? "أضف مكوّناً واحداً على الأقل." : "Add at least one ingredient.";
    const out: RecipeSaveInput["lines"] = [];
    for (const [i, l] of lines.entries()) {
      const qty = Number(l.qty);
      if (!l.itemId && !l.label.trim()) return `${name} · ${i + 1}: ${locale === "ar" ? "اختر صنفاً أو اكتب اسماً" : "pick an item or type a name"}`;
      if (!(qty > 0)) return `${name} · ${l.label || byId.get(l.itemId)?.name || i + 1}: ${locale === "ar" ? "الكمية مطلوبة" : "amount is missing"}`;
      out.push({ inventory_item_id: l.itemId || null, label: l.itemId ? null : l.label.trim(), as_written: l.asWritten, qty, uom: l.uom, free: !l.itemId && l.free });
    }
    const price = d.price.trim() ? Number(d.price) : null;
    if (price != null && !(price >= 0)) return `${name}: ${locale === "ar" ? "السعر غير صحيح" : "price is not a number"}`;
    return { key: d.key, name, section: d.section.trim() || null, price, method: d.method.trim() || null, source: d.source, photo_drive_url: d.photo?.url ?? null, photo_drive_path: d.photo?.path ?? null, lines: out };
  }

  function save(keys: string[]) {
    const inputs: RecipeSaveInput[] = [];
    for (const d of drafts.filter((x) => keys.includes(x.key) && !x.saved)) {
      const v = toInput(d);
      if (typeof v === "string") {
        update(d.key, (x) => ({ ...x, error: v }));
        return;
      }
      update(d.key, (x) => ({ ...x, error: null }));
      inputs.push(v);
    }
    if (!inputs.length) return;
    startSaving(async () => {
      const res = await saveRecipes(inputs);
      const done = new Map(res.saved.map((s) => [s.key, s]));
      setDrafts((ds) => ds.map((d) => (done.has(d.key) ? { ...d, saved: { id: done.get(d.key)!.id, replaced: done.get(d.key)!.replaced }, error: null } : d)));
      if (!res.ok && res.error) {
        const failed = inputs.find((i) => !done.has(i.key));
        if (failed) update(failed.key, (x) => ({ ...x, error: res.error ?? null }));
        else setError(res.error);
      }
      router.refresh();
    });
  }

  const unsaved = drafts.filter((d) => !d.saved);
  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`rounded-full px-3.5 py-1.5 text-sm transition ${mode === m ? "bg-strow-ink font-semibold text-white" : "text-neutral-600"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <section className="rounded-[28px] bg-white px-[18px] py-5 md:p-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{t("add_recipes")}</h2>
          <div className="inline-flex gap-1 rounded-full bg-neutral-100 p-1">
            {tab("photo", t("tab_photo"))}
            {tab("text", t("tab_text"))}
            {tab("manual", t("tab_manual"))}
          </div>
        </div>

        {mode === "photo" && (
          <div className="mt-4">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => cameraRef.current?.click()}
                className="flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] bg-strow-ink text-sm font-semibold text-white transition active:scale-[.98] disabled:opacity-50"
              >
                <CameraIcon className="h-7 w-7" />
                {t("take_photo")}
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => galleryRef.current?.click()}
                className="flex min-h-[92px] flex-col items-center justify-center gap-1.5 rounded-[20px] border border-neutral-300 text-sm font-semibold transition active:scale-[.98] disabled:opacity-50"
              >
                <span className="text-2xl leading-none">🖼</span>
                {t("from_gallery")}
              </button>
            </div>
            {/* Camera input keeps `capture`; the gallery one has none so iPhone offers the Photo Library and several photos at once. */}
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <input ref={galleryRef} type="file" accept="image/*,application/pdf,.pdf" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <p className="mt-2.5 text-xs text-neutral-500">{t("photo_hint")}</p>
          </div>
        )}

        {mode === "text" && (
          <div className="mt-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              dir="auto"
              placeholder={t("text_placeholder")}
              className="w-full rounded-[18px] border border-neutral-300 px-3.5 py-3 text-[15px] leading-relaxed focus:border-strow-ink focus:outline-none"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500">{t("text_hint")}</p>
              <button
                type="button"
                onClick={onReadText}
                disabled={!!busy || !text.trim()}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-strow-blue px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
              >
                <Sparkle className="h-4 w-4" />
                {t("read_with_ai")}
              </button>
            </div>
          </div>
        )}

        {mode === "manual" && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-neutral-500">{t("manual_hint")}</p>
            <button type="button" onClick={addBlank} className="shrink-0 rounded-full bg-strow-ink px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95">
              + {t("new_recipe")}
            </button>
          </div>
        )}

        {busy ? (
          <p className="mt-4 flex items-center gap-2.5 text-sm text-neutral-600">
            <span className="ai-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            {busy}
          </p>
        ) : null}
        {error ? <p className="mt-3 rounded-2xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p> : null}
        {note ? (
          <p className="mt-3 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            {t("ai_note")}: {note}
          </p>
        ) : null}
      </section>

      {drafts.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3 px-1">
            <div>
              <h2 className="font-display text-lg font-semibold">{t("review")}</h2>
              <p className="text-xs text-neutral-500">{t("review_hint")}</p>
            </div>
            <div className="flex items-center gap-2">
              {drafts.some((d) => d.saved) ? (
                <button type="button" onClick={() => setDrafts((ds) => ds.filter((d) => !d.saved))} className="rounded-full px-3 py-2 text-sm text-neutral-500">
                  {locale === "ar" ? "إخفاء المحفوظ" : "Hide saved"}
                </button>
              ) : null}
              {unsaved.length > 1 ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => save(unsaved.map((d) => d.key))}
                  className="rounded-full bg-strow-ink px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
                >
                  {saving ? t("saving") : `${t("save_all")} (${unsaved.length})`}
                </button>
              ) : null}
            </div>
          </div>
          {drafts.map((d) => (
            <DraftCard
              key={d.key}
              draft={d}
              items={items}
              byId={byId}
              sections={sections}
              replaces={!!existing[d.name.trim().toLowerCase()]}
              saving={saving}
              onChange={(fn) => update(d.key, fn)}
              onSave={() => save([d.key])}
              onDiscard={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
            />
          ))}
        </section>
      )}
    </>
  );
}

function blankLine(): DraftLine {
  return { key: nextKey(), itemId: "", label: "", asWritten: null, qty: "", uom: "g", free: false, note: null, conf: "high" };
}

function DraftCard({
  draft: d,
  items,
  byId,
  sections,
  replaces,
  saving,
  onChange,
  onSave,
  onDiscard,
}: {
  draft: Draft;
  items: ItemOption[];
  byId: Map<string, ItemOption>;
  sections: string[];
  replaces: boolean;
  saving: boolean;
  onChange: (fn: (d: Draft) => Draft) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const locale = useLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const [photoOpen, setPhotoOpen] = useState(false);
  const listId = `sections-${d.key}`;
  const setLine = (key: string, fn: (l: DraftLine) => DraftLine) => onChange((x) => ({ ...x, lines: x.lines.map((l) => (l.key === key ? fn(l) : l)) }));

  if (d.saved) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[22px] bg-white px-[18px] py-3.5">
        <span className="min-w-0 truncate text-[15px]">
          <span className="text-emerald-600">✓</span> <strong>{d.name}</strong>{" "}
          <span className="text-sm text-neutral-500">· {t("saved")}</span>
        </span>
        <Link href={`/owner/recipes/${d.saved.id}` as Route} className="shrink-0 text-sm font-semibold text-strow-blue">
          {t("open")}
        </Link>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-[15px] focus:border-strow-ink focus:outline-none";
  return (
    <div className={`pulse-pop rounded-[28px] bg-white px-[18px] py-5 md:p-[22px] ${d.conf !== "high" ? "ring-1 ring-amber-300" : ""}`}>
      <div className="flex items-start gap-3">
        {d.preview ? (
          <button type="button" onClick={() => setPhotoOpen(true)} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100" aria-label={t("photo")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.preview} alt="" className="h-full w-full object-cover" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <input
            value={d.name}
            onChange={(e) => onChange((x) => ({ ...x, name: e.target.value }))}
            placeholder={t("name")}
            dir="auto"
            className="w-full border-b border-transparent bg-transparent font-display text-xl font-bold tracking-tight focus:border-neutral-300 focus:outline-none"
          />
          {replaces ? <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{t("updates_existing")}</span> : null}
        </div>
        <button type="button" onClick={onDiscard} className="shrink-0 rounded-full px-2 py-1 text-sm text-neutral-400" aria-label={t("discard")}>
          ✕
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500">
          {t("section")}
          <input list={listId} value={d.section} onChange={(e) => onChange((x) => ({ ...x, section: e.target.value }))} className={`${input} mt-1`} />
          <datalist id={listId}>
            {sections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="text-xs text-neutral-500">
          {t("price")}
          <input inputMode="decimal" value={d.price} onChange={(e) => onChange((x) => ({ ...x, price: e.target.value }))} placeholder="AED" className={`${input} mt-1`} />
        </label>
      </div>

      <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("ingredients")}</p>
      <div className="flex flex-col gap-2">
        {d.lines.map((l) => (
          <LineEditor
            key={l.key}
            line={l}
            items={items}
            item={l.itemId ? byId.get(l.itemId) : undefined}
            onChange={(fn) => setLine(l.key, fn)}
            onRemove={() => onChange((x) => ({ ...x, lines: x.lines.filter((y) => y.key !== l.key) }))}
          />
        ))}
      </div>
      <button type="button" onClick={() => onChange((x) => ({ ...x, lines: [...x.lines, blankLine()] }))} className="mt-2 min-h-11 text-sm font-semibold text-strow-blue">
        {t("add_ingredient")}
      </button>

      <details className="mt-1" open={!!d.method}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm text-neutral-500">{t("method")}</summary>
        <textarea value={d.method} onChange={(e) => onChange((x) => ({ ...x, method: e.target.value }))} rows={3} dir="auto" className={input} />
      </details>

      {d.error ? <p className="mt-2 rounded-2xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{d.error}</p> : null}
      <div className="mt-3 flex justify-end">
        <button type="button" disabled={saving} onClick={onSave} className="rounded-full bg-strow-ink px-5 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50">
          {saving ? t("saving") : t("save")}
        </button>
      </div>

      {photoOpen && d.preview ? <PhotoViewer src={d.preview} caption={d.name} onClose={() => setPhotoOpen(false)} /> : null}
    </div>
  );
}

export function ItemSelect({ items, value, onChange, className = "" }: { items: ItemOption[]; value: string; onChange: (v: string) => void; className?: string }) {
  const locale = useLocale();
  const ar = locale === "ar";
  const groups = KIND_ORDER.map((k) => ({ k, list: items.filter((i) => (KIND_LABEL[i.kind] ? i.kind : "other") === k) })).filter((g) => g.list.length);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{rt("not_in_stock", locale)}</option>
      {groups.map((g) => (
        <optgroup key={g.k} label={ar ? KIND_LABEL[g.k].ar : KIND_LABEL[g.k].en}>
          {g.list.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {i.base ? ` · /${i.base}` : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function LineEditor({
  line: l,
  items,
  item,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  items: ItemOption[];
  item: ItemOption | undefined;
  onChange: (fn: (l: DraftLine) => DraftLine) => void;
  onRemove: () => void;
}) {
  const locale = useLocale();
  const t = (k: Parameters<typeof rt>[0]) => rt(k, locale);
  const unsure = l.conf !== "high";
  const field = "rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-[15px] focus:border-strow-ink focus:outline-none";
  // Bought per kg but the recipe says ml (or similar): offer the matching unit.
  const mismatch = item?.base && item.base !== "pcs" && baseOfUom(l.uom) !== item.base ? recipeUomFor(item.base) : null;
  return (
    <div className={`rounded-[18px] border p-2.5 ${unsure ? "border-amber-300 bg-amber-50/60" : "border-neutral-200"}`}>
      <ItemSelect
        items={items}
        value={l.itemId}
        onChange={(v) =>
          onChange((x) => {
            const it = items.find((i) => i.id === v);
            const uom = !x.qty && it?.base ? recipeUomFor(it.base) : x.uom;
            return { ...x, itemId: v, uom, conf: x.conf === "low" ? "medium" : x.conf };
          })
        }
        className={`${field} w-full`}
      />
      {!l.itemId ? (
        <input value={l.label} onChange={(e) => onChange((x) => ({ ...x, label: e.target.value }))} placeholder={t("label_ph")} dir="auto" className={`${field} mt-2 w-full`} />
      ) : null}
      <div className="mt-2 flex items-center gap-2">
        <input
          inputMode="decimal"
          value={l.qty}
          onChange={(e) => onChange((x) => ({ ...x, qty: e.target.value.replace(",", ".") }))}
          placeholder={t("qty")}
          className={`${field} w-24`}
        />
        <select value={l.uom} onChange={(e) => onChange((x) => ({ ...x, uom: normUom(e.target.value) ?? x.uom }))} className={`${field} w-20`}>
          {RECIPE_UOMS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        {!l.itemId ? (
          <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-neutral-600">
            <input type="checkbox" checked={l.free} onChange={(e) => onChange((x) => ({ ...x, free: e.target.checked }))} />
            <span className="truncate">{t("free")}</span>
          </label>
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
            {item?.base ? `${t("bought_per")} ${item.base}` : t("never_bought")}
          </span>
        )}
        <button type="button" onClick={onRemove} className="shrink-0 rounded-full px-2 py-1 text-neutral-400" aria-label={t("remove")}>
          ✕
        </button>
      </div>
      {l.asWritten || l.note ? (
        <p className={`mt-1.5 text-xs ${unsure ? "text-amber-800" : "text-neutral-500"}`}>
          {l.asWritten ? `${t("written")}: “${l.asWritten}”` : ""}
          {l.asWritten && l.note ? " · " : ""}
          {l.note ?? ""}
        </p>
      ) : null}
      {mismatch ? (
        <button type="button" onClick={() => onChange((x) => ({ ...x, uom: mismatch }))} className="mt-1.5 text-xs font-semibold text-strow-blue">
          {t("bought_per")} {item?.base} → {locale === "ar" ? "استخدم" : "use"} {mismatch}
        </button>
      ) : null}
    </div>
  );
}
