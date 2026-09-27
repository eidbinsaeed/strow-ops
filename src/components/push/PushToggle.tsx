"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/dict";

type State = "loading" | "unsupported" | "install" | "denied" | "off" | "on";

const T = {
  en: {
    title: "Lock-screen alerts",
    cardTitle: "Get lock-screen alerts",
    loading: "Checking…",
    unsupported: "This browser can't show alerts.",
    install: "Open Strow from your Home Screen icon to turn these on (Share → Add to Home Screen).",
    denied: "Blocked on this phone. Turn on in Settings → Notifications → Strow.",
    off: "A notification the moment a barista uploads a closing or a bill.",
    on: "On for this phone.",
    turnOn: "Turn on",
    turnOff: "Turn off",
    test: "Send a test",
    enabled: "On. Lock your phone and tap “Send a test” to try it.",
    testSent: "Test sent — it should appear in a few seconds.",
    noPhone: "No phone is subscribed yet.",
  },
  ar: {
    title: "تنبيهات شاشة القفل",
    cardTitle: "فعّل تنبيهات شاشة القفل",
    loading: "جارٍ التحقق…",
    unsupported: "هذا المتصفح لا يدعم التنبيهات.",
    install: "افتح Strow من أيقونة الشاشة الرئيسية لتفعيلها (مشاركة ← إضافة إلى الشاشة الرئيسية).",
    denied: "التنبيهات محظورة. فعّلها من الإعدادات ← الإشعارات ← Strow.",
    off: "تنبيه فوري عندما يرفع الباريستا إقفالاً أو فاتورة.",
    on: "مفعّلة على هذا الهاتف.",
    turnOn: "تفعيل",
    turnOff: "إيقاف",
    test: "إرسال تجربة",
    enabled: "تم التفعيل. اقفل الهاتف واضغط «إرسال تجربة».",
    testSent: "أُرسلت التجربة — ستظهر خلال ثوانٍ.",
    noPhone: "لا يوجد هاتف مشترك بعد.",
  },
};

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Turn lock-screen alerts on/off for this phone. "row" lives in the menu; "card" is the one-time prompt on Pulse. */
export function PushToggle({ variant = "row", locale = "en" }: { variant?: "row" | "card"; locale?: Locale }) {
  const t = T[locale] ?? T.en;
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("strow:push-card") === "dismissed");
    } catch {
      setDismissed(false);
    }
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isStandalone() ? "install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await registration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      // Ask first: iPhone only shows the permission prompt straight from a tap.
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      if (!reg) throw new Error(t.unsupported);
      await navigator.serviceWorker.ready;
      const k = await fetch("/api/push/key", { cache: "no-store" });
      const kj = (await k.json().catch(() => ({}))) as { publicKey?: string; error?: string };
      if (!k.ok || !kj.publicKey) throw new Error(kj.error || "Could not get the alert key");
      const old = await reg.pushManager.getSubscription();
      if (old) await old.unsubscribe().catch(() => false);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(kj.publicKey) });
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      const rj = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !rj.ok) throw new Error(rj.error || "Could not save this phone");
      setState("on");
      setMsg(t.enabled);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await registration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe().catch(() => false);
      }
      setState("off");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/push/test", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { sent?: number; error?: string };
      setMsg(j.sent ? t.testSent : j.error || t.noPhone);
    } finally {
      setBusy(false);
    }
  }

  const hint = t[state === "loading" ? "loading" : state];

  if (variant === "card") {
    if (dismissed || !(state === "off" || state === "install" || state === "denied")) return null;
    return (
      <div className="mb-4 flex items-center gap-3 rounded-[24px] bg-white p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-strow-blue text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-strow-ink">{t.cardTitle}</p>
          <p className="text-xs leading-snug text-neutral-500">{msg ?? hint}</p>
        </div>
        {state === "off" ? (
          <button type="button" onClick={enable} disabled={busy} className="h-10 shrink-0 rounded-full bg-strow-ink px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "…" : t.turnOn}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem("strow:push-card", "dismissed");
            } catch {
              /* private mode */
            }
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-neutral-400"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="mx-3 mb-2 rounded-[18px] bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-strow-ink">{t.title}</p>
          <p className="text-xs leading-snug text-neutral-500">{hint}</p>
        </div>
        {state === "on" ? (
          <button type="button" onClick={disable} disabled={busy} className="h-9 shrink-0 rounded-full border border-neutral-300 px-3.5 text-xs font-semibold text-neutral-700 disabled:opacity-60">
            {busy ? "…" : t.turnOff}
          </button>
        ) : state === "off" ? (
          <button type="button" onClick={enable} disabled={busy} className="h-9 shrink-0 rounded-full bg-strow-blue px-3.5 text-xs font-semibold text-white disabled:opacity-60">
            {busy ? "…" : t.turnOn}
          </button>
        ) : null}
      </div>
      {state === "on" ? (
        <button type="button" onClick={test} disabled={busy} className="mt-2 text-xs font-semibold text-strow-blue">
          {t.test}
        </button>
      ) : null}
      {msg ? <p className="mt-1.5 text-xs text-neutral-600">{msg}</p> : null}
    </div>
  );
}
