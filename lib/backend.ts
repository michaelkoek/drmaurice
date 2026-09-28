import { authClient } from "./auth-client";
import type { Exam, Lesson, OwnCard, Progress, Subject } from "./types";

export interface Snapshot { email: string | null; exams: Exam[]; subjects: Subject[]; lessons: Lesson[]; own: OwnCard[]; progress: Progress[] }
type Table = "exams" | "subjects" | "lessons" | "own_cards";

/** Everything the app reads or writes goes through here. */
export interface Backend {
  load(): Promise<Snapshot>;
  insert<T>(table: Table, row: Record<string, unknown>): Promise<T>;
  update(table: Table, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(table: Table, id: string): Promise<void>;
  saveProgress(p: Progress): Promise<void>;
  signOut(): Promise<void>;
}

async function api<T>(init?: { body: Record<string, unknown> }): Promise<T> {
  const res = await fetch("/api/data", init ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) } : undefined);
  // the proxy only checks that a session cookie exists; an expired one lands here
  if (res.status === 401) { window.location.href = "/login"; return new Promise<never>(() => {}); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw json; // { code, message }, e.g. code "23503" for a foreign-key violation
  return json as T;
}

const neonBackend: Backend = {
  load: () => api<Snapshot>(),
  insert: (table, row) => api({ body: { op: "insert", table, row } }),
  async update(table, id, patch) { await api({ body: { op: "update", table, id, row: patch } }); },
  async remove(table, id) { await api({ body: { op: "remove", table, id } }); },
  async saveProgress(p) { await api({ body: { op: "progress", progress: p } }); },
  async signOut() { await authClient.signOut(); },
};

/** In-memory stand-in, only compiled in when NEXT_PUBLIC_E2E=1 (browser tests without a database). */
function memoryBackend(): Backend {
  const db: Record<string, Record<string, unknown>[]> = { exams: [], subjects: [], lessons: [], own_cards: [], progress: [] };
  (globalThis as unknown as { __dmcDb: typeof db }).__dmcDb = db;
  return {
    async load() { const c = structuredClone(db); return { email: "test@example.com", exams: c.exams, subjects: c.subjects, lessons: c.lessons, own: c.own_cards, progress: c.progress } as unknown as Snapshot; },
    async insert(table, row) { const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row }; db[table].push(r); return structuredClone(r) as never; },
    async update(table, id, patch) { const r = db[table].find((x) => x.id === id); if (r) Object.assign(r, patch); },
    async remove(table, id) {
      if (table === "subjects" && db.lessons.some((l) => l.subject_id === id)) throw { code: "23503" };
      db[table] = db[table].filter((x) => x.id !== id);
    },
    async saveProgress(p) { db.progress = db.progress.filter((x) => x.lesson_id !== p.lesson_id).concat([{ ...p }]); },
    async signOut() {},
  };
}

export const backend: Backend = process.env.NEXT_PUBLIC_E2E === "1" ? memoryBackend() : neonBackend;
