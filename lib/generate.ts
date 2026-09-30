"use client";
import { slideDigest, type ParsedDeck, type ParsedGoals } from "./parse";
import { toDataUrl } from "./image";
import { normalizeDraft } from "./normalize";
import type { Draft, Subject } from "./types";

export type StepKey = "read" | "pick" | "write" | "check";
export type StepState = "idle" | "on" | "ok" | "fail";
export type OnStep = (key: StepKey, state: StepState, sub?: string) => void;

const MAX_IMAGES = 8;

export class GenError extends Error { constructor(public code: string, message: string) { super(message); } }

async function postJson(url: string, body: unknown, signal: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new GenError(j.code || "upstream_error", j.message || "Er ging iets mis.");
  }
  return res;
}

export async function generateLesson(opts: {
  deck: ParsedDeck | null; deckName: string | null; goals: ParsedGoals | null; goalsName: string | null;
  subjects: Subject[]; signal: AbortSignal; onStep: OnStep;
}): Promise<Draft> {
  const { deck, goals, subjects, signal, onStep } = opts;
  const goalsText = (goals?.text ?? "").trim();
  const goalsAsImage = !goalsText && !!goals?.preview;
  const images: { dataUrl: string; label: string }[] = [];
  let digest = "";

  if (deck) {
    const unit = deck.kind === "pdf" ? "pagina" : "slide";
    onStep("read", "ok", `${deck.slides.length} ${unit === "pagina" ? "pagina's" : "slides"}${goals ? " en lesdoelen" : ""}`);

    // 1. which slide images carry content? (PDF pages are pre-filtered in lib/pdf.ts and have no size)
    const seen = new Set<string>();
    const cands: { id: string; slide: number; title: string; kb: number; path: string }[] = [];
    for (const s of deck.slides) for (const im of s.images) {
      if (seen.has(im.path) || (deck.kind === "pptx" && (im.size < 12_000 || im.size > 15e6))) continue;
      seen.add(im.path);
      cands.push({ id: "img" + cands.length, slide: s.n, title: (s.text.find((t) => !/^\d+$/.test(t)) ?? "").slice(0, 80), kb: Math.round(im.size / 1000), path: im.path });
    }
    const room = MAX_IMAGES - (goalsAsImage ? 1 : 0);
    let chosen = cands;
    if (cands.length > room) {
      onStep("pick", "on");
      const res = await postJson("/api/pick-images", { goals: goalsText, digest: slideDigest(deck.slides, 30000), candidates: cands.map(({ path: _p, ...c }) => c), max: room }, signal);
      const ids = new Set<string>((await res.json()).ids ?? []);
      chosen = cands.filter((c) => ids.has(c.id));
    }
    for (const c of chosen.slice(0, room)) {
      // PDF pages are called slides in the prompt too
      try { images.push({ dataUrl: await toDataUrl(await deck.image(c.path)), label: `slide ${c.slide}` }); } catch { /* undecodable image: skip */ }
    }
    if (goalsAsImage) images.push({ dataUrl: await toDataUrl(goals!.preview!, 1600), label: "voorvertoning van het lesdoelen-document" });
    onStep("pick", "ok", images.length ? `${images.length} afbeeldingen meegestuurd${chosen.length ? ` (${unit} ${chosen.map((c) => c.slide).join(", ")})` : ""}` : "Geen afbeeldingen nodig");
    digest = slideDigest(deck.slides, 55000);
  } else {
    // no presentation: the server researches the goals on the web
    if (!goals || (!goalsText && !goalsAsImage)) throw new GenError("bad_request", "Voeg een presentatie of lesdoelen toe.");
    onStep("read", "ok", "Lesdoelen, geen presentatie");
    if (goalsAsImage) images.push({ dataUrl: await toDataUrl(goals.preview!, 1600), label: "voorvertoning van het lesdoelen-document" });
  }

  // 2. write the cards (streamed so we can count them)
  onStep("write", "on", deck ? "De AI leest de stof…" : "De AI zoekt bronnen bij de lesdoelen…");
  const res = await postJson("/api/generate", {
    mode: deck ? "slides" : "web", goals: goalsText, goalsAsImage, digest, images,
    subjects: subjects.map((s) => ({ name: s.name, hint: s.hint })),
  }, signal);
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let text = "", n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    const m = (text.match(/"vraag"\s*:/g) || []).length;
    if (m !== n) { n = m; onStep("write", "on", `${n} ${n === 1 ? "kaart" : "kaarten"} geschreven…`); }
  }
  if (text.includes("\u0000ERROR")) throw new GenError("upstream_error", "Het schrijven van de kaarten is afgebroken. Probeer het opnieuw.");
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new GenError("invalid_json", "Het antwoord kon niet worden gelezen. Probeer het opnieuw."); }
  onStep("write", "ok", `${n} kaarten`);

  onStep("check", "on");
  let draft: Draft;
  try {
    const source: Draft["source"] = deck
      ? { pptx: opts.deckName, goals: opts.goalsName, slides: deck.slides.length }
      : { pptx: null, goals: opts.goalsName, slides: 0, web: true };
    const fallback = (opts.deckName ?? opts.goalsName)?.replace(/\.[^.]+$/, "") || "Nieuwe les";
    draft = normalizeDraft(raw as never, subjects, source, fallback);
  } catch { throw new GenError("invalid_json", "Er kwamen geen bruikbare kaarten uit. Probeer het opnieuw."); }
  onStep("check", "ok", `${draft.cards.length} kaarten · ${draft.goals.length} lesdoelen`);
  return draft;
}

