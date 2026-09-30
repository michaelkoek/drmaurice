import type { Card, Draft, Goal, Subject } from "./types";

interface Raw {
  les?: unknown; vak?: unknown; vakReden?: unknown;
  lesdoelen?: { id?: unknown; tekst?: unknown; dekking?: unknown }[];
  kaarten?: { lesdoel?: unknown; vraag?: unknown; antwoord?: unknown; bron?: unknown; letOp?: unknown }[];
  ontbreekt?: unknown[]; tegenstrijdig?: unknown[];
}

export const MISSING = "Dit staat niet in de presentatie. Zoek het op in het studiemateriaal.";
export const MISSING_WEB = "Hiervoor is geen betrouwbare bron gevonden. Zoek het op in het studiemateriaal.";

/** Model JSON → a draft lesson. Subjects are sent as keys v0..v5 in position order. */
export function normalizeDraft(o: Raw, subjects: Subject[], source: Draft["source"], fallbackName: string): Draft {
  if (!o || !Array.isArray(o.kaarten)) throw new Error("invalid_json");
  const goals: Goal[] = (Array.isArray(o.lesdoelen) ? o.lesdoelen : [])
    .map((g, i) => ({ id: Number(g.id) || i + 1, t: String(g.tekst ?? "").trim(), cov: (g.dekking === "volledig" ? "full" : g.dekking === "geen" ? "none" : "part") as Goal["cov"] }))
    .filter((g) => g.t);
  const ids = new Set(goals.map((g) => g.id));
  const missing = source.web ? MISSING_WEB : MISSING;
  const cards: Card[] = o.kaarten.filter((k) => k && String(k.vraag ?? "").trim()).map((k, i) => {
    const a = k.antwoord == null ? "" : String(k.antwoord).trim();
    const g = Number(k.lesdoel);
    return {
      id: "c" + i,
      g: ids.has(g) ? g : 0,
      q: String(k.vraag).trim(),
      a: a || null,
      ref: String(k.bron ?? "").trim(),
      note: k.letOp ? String(k.letOp) : null,
      gap: a ? null : missing,
    };
  });
  if (!cards.length) throw new Error("invalid_json");
  const m = /^v(\d)$/.exec(String(o.vak ?? ""));
  const subject = m ? subjects[Number(m[1])] : undefined;
  const list = (a: unknown) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean) : []);
  return {
    name: (String(o.les ?? "").trim() || fallbackName).slice(0, 120),
    subjectId: subject?.id ?? subjects[0]?.id ?? null,
    why: String(o.vakReden ?? ""),
    goals, cards,
    findings: { gaps: list(o.ontbreekt), conflicts: list(o.tegenstrijdig) },
    source,
  };
}
