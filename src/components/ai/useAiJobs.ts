"use client";

/**
 * One shared view of Strow AI's background jobs for everything on the page
 * (the "AI working" pill, Needs you). It asks the server only while something
 * is running or waiting; otherwise it sleeps until a screen starts a run
 * (refreshAiJobs) or the live-updates check sees one (noteAiJobs).
 *
 * Safety net: if jobs are waiting and nothing is running twice in a row, the
 * queue stands still (a hand-over between server runs was lost), and this
 * starts it again. So an open Strow screen always keeps the queue moving.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { JobsStatus } from "@/lib/ai/job-types";

const POLL_MS = 2500;

let snap: JobsStatus | null = null;
/** Server clock minus this device's clock (ms), so "started 12 s ago" is right on a phone with a wrong clock. */
let skew = 0;
const listeners = new Set<() => void>();
let timer: number | undefined;
let loading = false;
let again = false;
let users = 0;
let stalled = 0;
let lastKick = 0;

const active = (s: JobsStatus | null) => !!s && (s.running.length > 0 || s.queued.length > 0);

function publish(next: JobsStatus) {
  snap = next;
  listeners.forEach((l) => l());
}

function schedule() {
  window.clearTimeout(timer);
  if (!users || !active(snap)) return;
  timer = window.setTimeout(() => {
    if (document.visibilityState === "visible") void load();
    else schedule();
  }, POLL_MS);
}

async function load() {
  if (loading) {
    again = true;
    return;
  }
  loading = true;
  try {
    const r = await fetch("/api/ai/jobs", { cache: "no-store" });
    if (r.status === 401) {
      // Signed out: nothing to show, and nothing more to ask.
      publish({ now: new Date().toISOString(), running: [], queued: [], batch: null, recent: [], lastBatch: null });
    } else if (r.ok) {
      const j = (await r.json()) as JobsStatus;
      if (j && Array.isArray(j.running) && Array.isArray(j.queued)) {
        const t = Date.parse(j.now);
        if (!Number.isNaN(t)) skew = t - Date.now();
        publish(j);
        if (j.queued.length && !j.running.some((x) => x.kind === "item")) {
          stalled++;
          if (stalled >= 2 && Date.now() - lastKick > 10_000) {
            lastKick = Date.now();
            void fetch("/api/ai/jobs/work", { method: "POST" }).catch(() => {});
          }
        } else stalled = 0;
      }
    }
  } catch {
    /* offline: the next round catches up */
  } finally {
    loading = false;
    if (again) {
      again = false;
      void load();
    } else schedule();
  }
}

function onShow() {
  if (document.visibilityState === "visible" && (active(snap) || snap === null)) void load();
}

/** Ask now: call right after starting or stopping a run. */
export function refreshAiJobs() {
  if (typeof window !== "undefined" && users) void load();
}

/** The live-updates check reports how many runs are going: wake up when there are any, or to notice the last one ending. */
export function noteAiJobs(count: number) {
  if (typeof window === "undefined" || !users) return;
  if (count > 0 || active(snap)) void load();
}

/** This device's time for a server timestamp. */
export function localTime(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? Date.now() : t - skew;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getSnap = () => snap;
const getServerSnap = () => null;

export function useAiJobs(): JobsStatus | null {
  const s = useSyncExternalStore(subscribe, getSnap, getServerSnap);
  useEffect(() => {
    users++;
    if (users === 1) {
      void load();
      document.addEventListener("visibilitychange", onShow);
      window.addEventListener("online", onShow);
    }
    return () => {
      users--;
      if (!users) {
        window.clearTimeout(timer);
        document.removeEventListener("visibilitychange", onShow);
        window.removeEventListener("online", onShow);
      }
    };
  }, []);
  return s;
}
