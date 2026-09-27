import { supabaseBrowser } from "./supabase/client";
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

const supabaseBackend: Backend = {
  async load() {
    const sb = supabaseBrowser();
    const [{ data: u }, ex, su, le, ow, pr] = await Promise.all([
      sb.auth.getUser(),
      sb.from("exams").select("*").order("created_at"),
      sb.from("subjects").select("*").order("position"),
      sb.from("lessons").select("*").order("created_at"),
      sb.from("own_cards").select("*").order("created_at"),
      sb.from("progress").select("lesson_id,mastered,first_try,last_studied_at"),
    ]);
    for (const r of [ex, su, le, ow, pr]) if (r.error) throw r.error;
    return { email: u.user?.email ?? null, exams: ex.data!, subjects: su.data!, lessons: le.data!, own: ow.data!, progress: pr.data! };
  },
  async insert(table, row) {
    const { data, error } = await supabaseBrowser().from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async update(table, id, patch) {
    const { error } = await supabaseBrowser().from(table).update(patch).eq("id", id);
    if (error) throw error;
  },
  async remove(table, id) {
    const { error } = await supabaseBrowser().from(table).delete().eq("id", id);
    if (error) throw error;
  },
  async saveProgress(p) {
    const { error } = await supabaseBrowser().from("progress").upsert(p, { onConflict: "user_id,lesson_id" });
    if (error) throw error;
  },
  async signOut() { await supabaseBrowser().auth.signOut(); },
};

/** In-memory stand-in, only compiled in when NEXT_PUBLIC_E2E=1 (browser tests without Supabase). */
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

export const backend: Backend = process.env.NEXT_PUBLIC_E2E === "1" ? memoryBackend() : supabaseBackend;
