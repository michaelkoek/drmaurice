import { afterEach, describe, expect, it, vi } from "vitest";
import { studyReminder } from "@/lib/reminder";
import type { Card, Exam, Lesson, Progress } from "@/lib/types";

vi.mock("server-only", () => ({}));
const { isPushEndpoint, parseSubscription } = await import("@/lib/push");
const { GET: cron } = await import("@/app/api/cron/reminders/route");

const card = (id: string, g = 1): Card => ({ id, g, q: "v", a: "a", ref: "", note: null, gap: null });
const exam = (id: string, exam_date: string | null): Exam => ({ id, name: `Toets ${id}`, exam_date, question_count: null, created_at: "" });
const lesson = (id: string, exam_id: string, cards: Card[]): Lesson =>
  ({ id, exam_id, subject_id: null, name: id, goals: [{ id: 1, t: "doel", cov: "full" }], cards, findings: { gaps: [], conflicts: [] }, source: null, created_at: "" });
const progress = (lesson_id: string, mastered: string[], last_studied_at: string | null): Progress => ({ lesson_id, mastered, first_try: {}, last_studied_at });

// 12:00 in Amsterdam on 10 March 2027
const NOW = new Date("2027-03-10T11:00:00Z");

describe("studyReminder", () => {
  it("names the nearest exam with cards left and a daily target", () => {
    const msg = studyReminder({
      exams: [exam("far", "2027-03-30"), exam("near", "2027-03-15"), exam("done", "2027-03-11")],
      lessons: [lesson("l1", "near", [card("a"), card("b"), card("c"), card("x", 0)]), lesson("l2", "far", [card("d")]), lesson("l3", "done", [card("e")])],
      own: [],
      progress: [progress("l1", ["a"], "2027-03-08T10:00:00Z"), progress("l3", ["e"], null)],
    }, NOW);
    // "x" is outside the learning goals and does not count
    expect(msg).toEqual({ title: "Nog 5 dagen tot Toets near", body: "2 kaarten te gaan, ongeveer 1 per dag. Je hebt vandaag nog niet geoefend.", url: "/examen/near", tag: "study-reminder" });
  });

  it("stays quiet after studying today (Amsterdam time), without a dated exam, or beyond 30 days", () => {
    const lessons = [lesson("l1", "e", [card("a")])];
    // 23:30 UTC on the 9th is already the 10th in Amsterdam
    expect(studyReminder({ exams: [exam("e", "2027-03-12")], lessons, own: [], progress: [progress("l1", [], "2027-03-09T23:30:00Z")] }, NOW)).toBeNull();
    expect(studyReminder({ exams: [exam("e", null)], lessons, own: [], progress: [] }, NOW)).toBeNull();
    expect(studyReminder({ exams: [exam("e", "2027-04-20")], lessons, own: [], progress: [] }, NOW)).toBeNull();
    expect(studyReminder({ exams: [exam("e", "2027-03-09")], lessons, own: [], progress: [] }, NOW)).toBeNull();
  });

  it("has its own words for tomorrow and today, and counts own cards", () => {
    const own = [{ id: "o1", lesson_id: "l1", goal: 1, question: "q", answer_html: "a", answer_raw: "a", source: "", replaces: null, created_at: "" }];
    const lessons = [lesson("l1", "e", [card("a")])];
    expect(studyReminder({ exams: [exam("e", "2027-03-11")], lessons, own, progress: [] }, NOW)?.title).toBe("Morgen: Toets e");
    expect(studyReminder({ exams: [exam("e", "2027-03-11")], lessons, own, progress: [] }, NOW)?.body).toContain("2 kaarten");
    expect(studyReminder({ exams: [exam("e", "2027-03-10")], lessons, own: [], progress: [] }, NOW)?.title).toBe("Vandaag: Toets e");
  });
});

describe("push subscriptions", () => {
  it("accepts only real push services over https", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isPushEndpoint("https://wns2-db5p.notify.windows.com/w/?token=x")).toBe(true);
    expect(isPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushEndpoint("https://evilpush.apple.com.attacker.dev/x")).toBe(false);
    expect(isPushEndpoint("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isPushEndpoint("not a url")).toBe(false);
  });

  it("validates the serialized subscription", () => {
    const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "key", auth: "secret" } };
    expect(parseSubscription(ok)).toEqual(ok);
    expect(parseSubscription({ ...ok, keys: { p256dh: "key" } })).toBeNull();
    expect(parseSubscription({ ...ok, endpoint: "https://example.com/hook" })).toBeNull();
    expect(parseSubscription(null)).toBeNull();
  });
});

describe("reminder cron", () => {
  afterEach(() => vi.unstubAllEnvs());
  const call = (auth?: string) => cron(new Request("http://x/api/cron/reminders", { headers: auth ? { authorization: auth } : {} }));

  it("refuses requests without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });
});
