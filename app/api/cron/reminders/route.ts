import { timingSafeEqual } from "node:crypto";
import { hasAccess } from "@/lib/access";
import { sql } from "@/lib/db";
import { sendPush } from "@/lib/push";
import { studyReminder } from "@/lib/reminder";
import type { Exam, Lesson, OwnCard, Progress } from "@/lib/types";

export const maxDuration = 60;

/**
 * Daily study reminders (Vercel Cron, see vercel.json). No session: Vercel sends
 * `Authorization: Bearer $CRON_SECRET`, anything else is refused.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response("Unauthorized", { status: 401 });

  const db = sql();
  // devices not reminded in the last 20 h, so a retried cron run sends nothing twice
  const subs = await db.query(
    `select s.id, s.user_id, s.endpoint, s.p256dh, s.auth, u.email, u."paidAt"
       from push_subscriptions s join "user" u on u.id = s.user_id
      where s.last_sent_at is null or s.last_sent_at < now() - interval '20 hours'`,
  );
  const byUser = new Map<string, typeof subs>();
  for (const s of subs) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  let sent = 0, skipped = 0;

  for (const [userId, devices] of byUser) {
    if (!hasAccess({ email: devices[0].email, paidAt: devices[0].paidAt })) { skipped++; continue; }
    const [exams, lessons, own, progress] = await Promise.all([
      db.query(`select id, name, exam_date::text as exam_date from exams where user_id = $1`, [userId]),
      db.query(`select id, exam_id, goals, cards from lessons where user_id = $1`, [userId]),
      db.query(`select id, lesson_id, goal, replaces from own_cards where user_id = $1`, [userId]),
      db.query(`select lesson_id, mastered, first_try, last_studied_at from progress where user_id = $1`, [userId]),
    ]);
    const msg = studyReminder({ exams: exams as Exam[], lessons: lessons as Lesson[], own: own as OwnCard[], progress: progress as Progress[] });
    if (!msg) { skipped++; continue; }
    for (const d of devices) {
      if (await sendPush({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, msg)) {
        await db.query(`update push_subscriptions set last_sent_at = now() where id = $1`, [d.id]);
        sent++;
      }
    }
  }
  return Response.json({ users: byUser.size, sent, skipped });
}
