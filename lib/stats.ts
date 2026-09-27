import type { Card, Lesson, OwnCard, Progress } from "./types";

/** Generated cards plus the student's own; an own card can replace a generated one. */
export function cardsOf(lesson: Lesson, own: OwnCard[]): Card[] {
  const mine = own.filter((o) => o.lesson_id === lesson.id);
  const gone = new Set(mine.map((o) => o.replaces).filter(Boolean) as string[]);
  return [
    ...lesson.cards.filter((c) => !gone.has(c.id)),
    ...mine.map<Card>((o) => ({ id: o.id, g: o.goal, q: o.question, a: o.answer_html, raw: o.answer_raw, ref: o.source, note: null, gap: null, own: true })),
  ];
}

export interface LessonStats { total: number; done: number; score: number | null }

/** Counts only cards that belong to a learning goal (or all, when the lesson has none). */
export function lessonStats(lesson: Lesson, cards: Card[], p: Progress | undefined): LessonStats {
  const inScope = lesson.goals.length ? cards.filter((c) => c.g !== 0) : cards;
  const mastered = new Set(p?.mastered ?? []);
  const ids = new Set(cards.map((c) => c.id));
  const tries = Object.entries(p?.first_try ?? {}).filter(([k]) => ids.has(k)).map(([, v]) => v);
  return {
    total: inScope.length,
    done: inScope.filter((c) => mastered.has(c.id)).length,
    score: tries.length ? Math.round((tries.filter(Boolean).length / tries.length) * 100) : null,
  };
}

export function daysUntil(date: string | null, now = new Date()): number | null {
  if (!date) return null;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(date + "T00:00:00").getTime() - today.getTime()) / 864e5);
}

export function dailyTarget(cardsLeft: number, days: number | null): number | null {
  if (days == null || days <= 0) return null;
  return Math.ceil(cardsLeft / days);
}
