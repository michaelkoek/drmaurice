"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { backend, type Snapshot } from "./backend";
import { cardsOf, lessonStats } from "./stats";
import { plainToHtml } from "./sanitize";
import type { Card, Draft, Exam, Lesson, OwnCard, Progress, Subject } from "./types";
import { toast } from "@/components/ui";

interface Ctx extends Snapshot {
  ready: boolean;
  error: string | null;
  reload(): Promise<void>;
  // exams & subjects
  createExam(input: { name: string; exam_date: string | null; question_count: number | null; subjects: { name: string; hint: string | null }[] }): Promise<Exam>;
  updateExam(id: string, patch: Partial<Pick<Exam, "name" | "exam_date" | "question_count">>): Promise<void>;
  deleteExam(id: string): Promise<void>;
  addSubject(examId: string, name: string, hint: string | null): Promise<void>;
  updateSubject(id: string, patch: Partial<Pick<Subject, "name" | "hint">>): Promise<void>;
  deleteSubject(id: string): Promise<boolean>;
  // lessons
  createLesson(examId: string, draft: Draft): Promise<Lesson>;
  updateLesson(id: string, patch: Partial<Pick<Lesson, "name" | "subject_id">>): Promise<void>;
  deleteLesson(id: string): Promise<void>;
  // cards & progress
  cardsFor(lesson: Lesson): Card[];
  saveOwnCard(input: { id?: string; lessonId: string; goal: number; question: string; answer: string; source: string; replaces?: string | null }): Promise<void>;
  deleteOwnCard(id: string): Promise<void>;
  progressFor(lessonId: string): Progress;
  answer(lessonId: string, cardId: string, knew: boolean): void;
  resetProgress(lessonId: string): void;
  signOut(): Promise<void>;
}

const DataCtx = createContext<Ctx | null>(null);
export const useData = () => {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData outside DataProvider");
  return c;
};

const empty: Snapshot = { email: null, exams: [], subjects: [], lessons: [], own: [], progress: [] };
const fail = (what: string) => (e: unknown) => { console.error(what, e); toast(`${what} lukte niet. Controleer je verbinding.`); throw e; };

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const progressRef = useRef<Progress[]>([]);
  progressRef.current = snap.progress;

  const reload = useCallback(async () => {
    try { setSnap(await backend.load()); setError(null); }
    catch (e) { console.error(e); setError("Je gegevens konden niet geladen worden."); }
    finally { setReady(true); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // progress is written at most once per 700 ms per lesson
  const flushProgress = useCallback((lessonId: string) => {
    clearTimeout(timers.current[lessonId]);
    timers.current[lessonId] = setTimeout(() => {
      const p = progressRef.current.find((x) => x.lesson_id === lessonId);
      if (p) backend.saveProgress(p).catch(() => toast("Voortgang opslaan lukte niet."));
    }, 700);
  }, []);

  const value = useMemo<Ctx>(() => {
    const set = (fn: (s: Snapshot) => Snapshot) => setSnap((s) => fn(s));
    const progressFor = (lessonId: string): Progress =>
      snap.progress.find((p) => p.lesson_id === lessonId) ?? { lesson_id: lessonId, mastered: [], first_try: {}, last_studied_at: null };
    const patchProgress = (lessonId: string, fn: (p: Progress) => Progress) => {
      set((s) => {
        const cur = s.progress.find((p) => p.lesson_id === lessonId) ?? { lesson_id: lessonId, mastered: [], first_try: {}, last_studied_at: null };
        return { ...s, progress: [...s.progress.filter((p) => p.lesson_id !== lessonId), fn(cur)] };
      });
      flushProgress(lessonId);
    };
    return {
      ...snap, ready, error, reload,
      async createExam({ subjects, ...exam }) {
        const e = await backend.insert<Exam>("exams", exam).catch(fail("Examen aanmaken"));
        const subs: Subject[] = [];
        for (const [i, s] of subjects.entries()) subs.push(await backend.insert<Subject>("subjects", { exam_id: e.id, name: s.name, hint: s.hint, color: i, position: i }).catch(fail("Vak aanmaken")));
        set((st) => ({ ...st, exams: [...st.exams, e], subjects: [...st.subjects, ...subs] }));
        return e;
      },
      async updateExam(id, patch) {
        await backend.update("exams", id, patch).catch(fail("Opslaan"));
        set((s) => ({ ...s, exams: s.exams.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
      },
      async deleteExam(id) {
        await backend.remove("exams", id).catch(fail("Verwijderen"));
        const lessonIds = new Set(snap.lessons.filter((l) => l.exam_id === id).map((l) => l.id));
        set((s) => ({ ...s, exams: s.exams.filter((e) => e.id !== id), subjects: s.subjects.filter((x) => x.exam_id !== id), lessons: s.lessons.filter((l) => l.exam_id !== id),
          own: s.own.filter((o) => !lessonIds.has(o.lesson_id)), progress: s.progress.filter((p) => !lessonIds.has(p.lesson_id)) }));
      },
      async addSubject(examId, name, hint) {
        const existing = snap.subjects.filter((s) => s.exam_id === examId);
        const used = new Set(existing.map((s) => s.color));
        const color = [0, 1, 2, 3, 4, 5].find((c) => !used.has(c)) ?? 0;
        const s = await backend.insert<Subject>("subjects", { exam_id: examId, name, hint, color, position: existing.length }).catch(fail("Vak toevoegen"));
        set((st) => ({ ...st, subjects: [...st.subjects, s] }));
      },
      async updateSubject(id, patch) {
        await backend.update("subjects", id, patch).catch(fail("Opslaan"));
        set((s) => ({ ...s, subjects: s.subjects.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
      },
      async deleteSubject(id) {
        if (snap.lessons.some((l) => l.subject_id === id)) return false;
        await backend.remove("subjects", id).catch(fail("Verwijderen"));
        set((s) => ({ ...s, subjects: s.subjects.filter((x) => x.id !== id) }));
        return true;
      },
      async createLesson(examId, d) {
        const l = await backend.insert<Lesson>("lessons", { exam_id: examId, subject_id: d.subjectId, name: d.name, goals: d.goals, cards: d.cards, findings: d.findings, source: d.source }).catch(fail("Les opslaan"));
        set((s) => ({ ...s, lessons: [...s.lessons, l] }));
        return l;
      },
      async updateLesson(id, patch) {
        await backend.update("lessons", id, patch).catch(fail("Opslaan"));
        set((s) => ({ ...s, lessons: s.lessons.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
      },
      async deleteLesson(id) {
        await backend.remove("lessons", id).catch(fail("Verwijderen"));
        set((s) => ({ ...s, lessons: s.lessons.filter((l) => l.id !== id), own: s.own.filter((o) => o.lesson_id !== id), progress: s.progress.filter((p) => p.lesson_id !== id) }));
      },
      cardsFor: (lesson) => cardsOf(lesson, snap.own),
      async saveOwnCard({ id, lessonId, goal, question, answer, source, replaces }) {
        const row = { lesson_id: lessonId, goal, question, answer_raw: answer, answer_html: plainToHtml(answer), source: source || "Eigen kaart" };
        if (id) {
          await backend.update("own_cards", id, row).catch(fail("Kaart opslaan"));
          set((s) => ({ ...s, own: s.own.map((o) => (o.id === id ? { ...o, ...row } : o)) }));
        } else {
          const o = await backend.insert<OwnCard>("own_cards", { ...row, replaces: replaces ?? null }).catch(fail("Kaart opslaan"));
          set((s) => ({ ...s, own: [...s.own, o] }));
        }
      },
      async deleteOwnCard(id) {
        await backend.remove("own_cards", id).catch(fail("Verwijderen"));
        set((s) => ({ ...s, own: s.own.filter((o) => o.id !== id) }));
      },
      progressFor,
      answer(lessonId, cardId, knew) {
        patchProgress(lessonId, (p) => ({
          ...p,
          mastered: knew && !p.mastered.includes(cardId) ? [...p.mastered, cardId] : p.mastered,
          first_try: cardId in p.first_try ? p.first_try : { ...p.first_try, [cardId]: knew },
          last_studied_at: new Date().toISOString(),
        }));
      },
      resetProgress(lessonId) {
        patchProgress(lessonId, (p) => ({ ...p, mastered: [], first_try: {}, last_studied_at: new Date().toISOString() }));
      },
      async signOut() { await backend.signOut(); window.location.href = "/login"; },
    };
  }, [snap, ready, error, reload, flushProgress]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/** Lessons of one exam enriched with their merged cards and stats. */
export function useExamView(examId: string | null) {
  const d = useData();
  return useMemo(() => {
    const exam = d.exams.find((e) => e.id === examId) ?? null;
    const subjects = d.subjects.filter((s) => s.exam_id === examId).sort((a, b) => a.position - b.position);
    const lessons = d.lessons.filter((l) => l.exam_id === examId).map((l) => {
      const cards = d.cardsFor(l);
      const p = d.progressFor(l.id);
      return { lesson: l, cards, progress: p, ...lessonStats(l, cards, p) };
    });
    return { exam, subjects, lessons };
  }, [d, examId]);
}
