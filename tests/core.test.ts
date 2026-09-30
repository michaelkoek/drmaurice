import { describe, expect, it, vi } from "vitest";
import { snappyUncompress } from "@/lib/parse";
import { normalizeDraft, MISSING, MISSING_WEB } from "@/lib/normalize";
import { cardsPrompt, webCardsPrompt } from "@/lib/prompts";
import { cardsOf, dailyTarget, daysUntil, lessonStats } from "@/lib/stats";
import { plainToHtml, escapeHtml } from "@/lib/sanitize";
import type { Lesson, OwnCard, Subject } from "@/lib/types";

vi.mock("server-only", () => ({}));

const subjects: Subject[] = [
  { id: "s-pat", exam_id: "e", name: "Pathologie", hint: null, color: 0, position: 0 },
  { id: "s-ana", exam_id: "e", name: "Anatomie", hint: null, color: 1, position: 1 },
];
const lesson = (cards: Lesson["cards"], goals: Lesson["goals"] = [{ id: 1, t: "doel", cov: "full" }]): Lesson =>
  ({ id: "L", exam_id: "e", subject_id: "s-pat", name: "Les", goals, cards, findings: { gaps: [], conflicts: [] }, source: null, created_at: "" });

describe("snappy", () => {
  it("decodes literals and back-references", () => {
    // "abcabcabc": length 9, literal "abc", copy offset 3 length 6
    const buf = new Uint8Array([9, (3 - 1) << 2, 97, 98, 99, ((6 - 4) << 2) | 1, 3]);
    expect(new TextDecoder().decode(snappyUncompress(buf))).toBe("abcabcabc");
  });
});

describe("normalizeDraft", () => {
  const src = { pptx: "x.pptx", goals: null, slides: 3 };
  it("maps subject keys, goals and missing answers", () => {
    const d = normalizeDraft({
      les: "Embryologie", vak: "v1", vakReden: "r",
      lesdoelen: [{ id: 1, tekst: "a", dekking: "volledig" }, { id: 2, tekst: "b", dekking: "geen" }],
      kaarten: [
        { lesdoel: 1, vraag: "Q1", antwoord: "A1", bron: "Slide 1", letOp: null },
        { lesdoel: 2, vraag: "Q2", antwoord: null, bron: "Niet in de presentatie", letOp: null },
        { lesdoel: 9, vraag: "Q3", antwoord: "A3", bron: "Slide 2", letOp: "let op" },
      ],
      ontbreekt: ["iets"], tegenstrijdig: [],
    }, subjects, src, "x");
    expect(d.subjectId).toBe("s-ana");
    expect(d.goals.map((g) => g.cov)).toEqual(["full", "none"]);
    expect(d.cards[1]).toMatchObject({ a: null, gap: MISSING });
    expect(d.cards[2].g).toBe(0); // unknown goal falls outside the goals
    expect(d.findings.gaps).toEqual(["iets"]);
  });
  it("uses the web gap text for lessons researched online", () => {
    const d = normalizeDraft({ kaarten: [{ lesdoel: 1, vraag: "Q", antwoord: null, bron: "", letOp: null }] }, subjects, { pptx: null, goals: null, slides: 0, web: true }, "x");
    expect(d.cards[0].gap).toBe(MISSING_WEB);
    expect(d.source.pptx).toBeNull();
  });
  it("rejects output without cards", () => {
    expect(() => normalizeDraft({ kaarten: [] }, subjects, src, "x")).toThrow();
  });
});

describe("own cards", () => {
  const own = (o: Partial<OwnCard>): OwnCard => ({ id: "o1", lesson_id: "L", goal: 1, question: "q", answer_html: "a", answer_raw: "a", source: "Eigen kaart", replaces: null, created_at: "", ...o });
  it("replaces a generated card and appends new ones", () => {
    const l = lesson([{ id: "c0", g: 1, q: "x", a: null, ref: "", note: null, gap: MISSING }, { id: "c1", g: 1, q: "y", a: "b", ref: "", note: null, gap: null }]);
    const cards = cardsOf(l, [own({ id: "o1", replaces: "c0" }), own({ id: "o2" }), own({ id: "o3", lesson_id: "other" })]);
    expect(cards.map((c) => c.id)).toEqual(["c1", "o1", "o2"]);
    expect(cards.find((c) => c.id === "o1")?.own).toBe(true);
  });
});

describe("stats", () => {
  it("counts goal cards only and scores first attempts", () => {
    const l = lesson([
      { id: "a", g: 1, q: "", a: "", ref: "", note: null, gap: null },
      { id: "b", g: 1, q: "", a: "", ref: "", note: null, gap: null },
      { id: "x", g: 0, q: "", a: "", ref: "", note: null, gap: null },
    ]);
    const s = lessonStats(l, l.cards, { lesson_id: "L", mastered: ["a", "x"], first_try: { a: true, b: false, gone: true }, last_studied_at: null });
    expect(s).toEqual({ total: 2, done: 1, score: 50 });
  });
  it("computes days and daily target", () => {
    expect(daysUntil("2026-10-10", new Date("2026-10-01T15:00:00"))).toBe(9);
    expect(dailyTarget(100, 9)).toBe(12);
    expect(dailyTarget(100, 0)).toBeNull();
  });
});

describe("plainToHtml", () => {
  it("escapes and builds lists", () => {
    expect(plainToHtml("Intro <b>\n- een\n- twee\nslot")).toBe("Intro &lt;b&gt;<ul><li>een</li><li>twee</li></ul>slot");
    expect(escapeHtml(`"x"`)).toBe("&quot;x&quot;");
  });
});

describe("prompts", () => {
  const subs = [{ key: "v0", name: "Anatomie", hint: null }];
  it("web prompt carries the goals and no slides", () => {
    const p = webCardsPrompt({ goals: "1. Bouw van het hart", goalsAsImage: false, imageLabels: [], subjects: subs });
    expect(p).toContain("1. Bouw van het hart");
    expect(p).toContain("URL");
    expect(p).not.toContain("SLIDES");
  });
  it("slide prompt keeps its numbered rules", () => {
    const p = cardsPrompt({ goals: "", goalsAsImage: false, digest: "Slide 1: x", imageLabels: [], subjects: subs });
    expect(p).toMatch(/\n9\. Neem de lesdoelen letterlijk over/);
    expect(p).toContain('- "v0" = Anatomie');
  });
});
