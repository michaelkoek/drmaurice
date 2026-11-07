import { cardsOf, dailyTarget, daysUntil, lessonStats } from "./stats";
import type { Exam, Lesson, OwnCard, Progress } from "./types";

/** What a push notification shows; `url` opens on click. */
export interface PushMessage { title: string; body: string; url: string; tag: string }

/** Reminders only for exams this close, so a toets months away doesn't nag every day. */
export const REMINDER_HORIZON_DAYS = 30;

const amsterdamDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Amsterdam" });

/**
 * The daily study reminder for one student, or null when there is nothing worth saying:
 * already studied today, no dated exam within the horizon, or every card mastered.
 * Pure, so it is unit-tested; the cron route feeds it the rows from the database.
 */
export function studyReminder(
  data: { exams: Exam[]; lessons: Lesson[]; own: OwnCard[]; progress: Progress[] },
  now = new Date(),
): PushMessage | null {
  const today = amsterdamDay(now);
  if (data.progress.some((p) => p.last_studied_at && amsterdamDay(new Date(p.last_studied_at)) === today)) return null;

  const upcoming = data.exams
    .map((exam) => {
      const days = daysUntil(exam.exam_date, now);
      let left = 0;
      for (const l of data.lessons.filter((x) => x.exam_id === exam.id)) {
        const s = lessonStats(l, cardsOf(l, data.own), data.progress.find((p) => p.lesson_id === l.id));
        left += s.total - s.done;
      }
      return { exam, days, left };
    })
    .filter((x): x is typeof x & { days: number } => x.days != null && x.days >= 0 && x.days <= REMINDER_HORIZON_DAYS && x.left > 0)
    .sort((a, b) => a.days - b.days);

  const next = upcoming[0];
  if (!next) return null;
  const { exam, days, left } = next;
  const cards = `${left} ${left === 1 ? "kaart" : "kaarten"}`;
  const url = `/examen/${exam.id}`;
  const tag = "study-reminder";

  if (days === 0) return { title: `Vandaag: ${exam.name}`, body: `Nog ${cards} te gaan. Laatste rondje herhalen? Succes!`, url, tag };
  if (days === 1) return { title: `Morgen: ${exam.name}`, body: `Nog ${cards} te gaan tot de top.`, url, tag };
  const perDay = dailyTarget(left, days);
  return {
    title: `Nog ${days} dagen tot ${exam.name}`,
    body: `${cards} te gaan${perDay ? `, ongeveer ${perDay} per dag` : ""}. Je hebt vandaag nog niet geoefend.`,
    url,
    tag,
  };
}
