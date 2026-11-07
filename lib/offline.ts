"use client";
import type { Snapshot } from "./backend";
import type { Progress } from "./types";

/**
 * The student's data on this device, so lessons can be practised offline.
 * IndexedDB (not localStorage): lessons with all their cards easily exceed 5 MB.
 * Every call swallows errors (private mode, blocked storage): offline support is a bonus, never a crash.
 */
const DB = "drmauricecards", STORE = "kv";

let dbp: Promise<IDBDatabase> | null = null;
function open() {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbp = null; reject(req.error); };
  }));
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
    });
  } catch (e) {
    console.warn("[offline]", e);
    return undefined;
  }
}

const get = <T>(key: string) => tx<T>("readonly", (s) => s.get(key) as IDBRequest<T>);
const set = (key: string, value: unknown) => tx("readwrite", (s) => { s.put(value, key); });

export interface SavedSnapshot { snap: Snapshot; savedAt: string }

export const loadSnapshot = () => get<SavedSnapshot>("snapshot");
export const saveSnapshot = (snap: Snapshot) => set("snapshot", { snap, savedAt: new Date().toISOString() } satisfies SavedSnapshot);

/** Progress that could not be saved (offline), per lesson; the newest state wins. */
export const loadPending = async () => (await get<Record<string, Progress>>("pending")) ?? {};
export async function addPending(p: Progress) {
  await set("pending", { ...(await loadPending()), [p.lesson_id]: p });
}
/** With `sent`: only if nothing newer was queued while it was being sent. */
export async function removePending(lessonId: string, sent?: Progress) {
  const all = await loadPending();
  if (all[lessonId] && (!sent || JSON.stringify(all[lessonId]) === JSON.stringify(sent))) {
    delete all[lessonId];
    await set("pending", all);
  }
}

/** On sign-out: nothing of this student stays on the device. */
export async function clearOffline() {
  await tx("readwrite", (s) => { s.clear(); });
}

/** A failed fetch (no connection) rather than an error answer from the server. */
export const isNetworkError = (e: unknown) => e instanceof TypeError;
