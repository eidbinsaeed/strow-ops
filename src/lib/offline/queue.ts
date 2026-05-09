/**
 * Offline submit queue (browser-only).
 *
 * Stores serialized FormData entries in IndexedDB so submissions captured
 * during connection loss replay automatically when the network returns.
 *
 * Each queued item has:
 *   - id: random string
 *   - kind: "closing" | "expense"
 *   - body: { [name]: string } (FormData fields, all stringified)
 *   - createdAt: ms timestamp
 *
 * Replay is best-effort. Items that 4xx are dropped (with a console.error).
 * Items that 5xx or fail to fetch stay in the queue for next attempt.
 */

const DB_NAME = "strow-offline";
const DB_VERSION = 1;
const STORE = "submissions";

export type QueuedKind = "closing" | "expense";

export type QueuedItem = {
  id: string;
  kind: QueuedKind;
  body: Record<string, string>;
  createdAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueSubmission(
  kind: QueuedKind,
  formData: FormData,
): Promise<string> {
  const body: Record<string, string> = {};
  formData.forEach((value, key) => {
    body[key] = typeof value === "string" ? value : "";
  });

  const item: QueuedItem = {
    id: crypto.randomUUID(),
    kind,
    body,
    createdAt: Date.now(),
  };

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return item.id;
}

export async function listQueued(): Promise<QueuedItem[]> {
  const db = await openDb();
  return new Promise<QueuedItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      db.close();
      resolve(req.result as QueuedItem[]);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function deleteQueued(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function queuedCount(): Promise<number> {
  try {
    const items = await listQueued();
    return items.length;
  } catch {
    return 0;
  }
}

/**
 * Replay all queued submissions in order. Stops on the first network failure
 * so we don't burn through items when the connection is still flaky.
 *
 * Returns a summary: { ok, failed, skipped }.
 */
export async function drainQueue(): Promise<{
  ok: number;
  failed: number;
  skipped: number;
}> {
  let ok = 0;
  let failed = 0;
  let skipped = 0;

  let items: QueuedItem[];
  try {
    items = await listQueued();
  } catch {
    return { ok: 0, failed: 0, skipped: 0 };
  }

  for (const item of items.sort((a, b) => a.createdAt - b.createdAt)) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(item.body)) {
      fd.append(k, v);
    }

    try {
      const url =
        item.kind === "closing"
          ? "/api/queue/replay-closing"
          : "/api/queue/replay-expense";
      const res = await fetch(url, { method: "POST", body: fd });
      if (res.ok) {
        await deleteQueued(item.id);
        ok++;
      } else if (res.status >= 400 && res.status < 500) {
        // Permanent failure - drop the item so we don't replay forever.
        // eslint-disable-next-line no-console
        console.error(
          "[queue] dropping item",
          item.id,
          "status",
          res.status,
        );
        await deleteQueued(item.id);
        failed++;
      } else {
        skipped++;
        break; // network is flaky - try again next time
      }
    } catch {
      skipped++;
      break;
    }
  }

  return { ok, failed, skipped };
}
