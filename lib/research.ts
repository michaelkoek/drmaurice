import "server-only";
import { TASKS, cardsRequest, logUsage, openai, type TaskModel } from "./openai";
import { TRUSTED_DOMAINS, webCardsPrompt, type SubjectRef } from "./prompts";
import type { Usage } from "./types";

export interface WebOut {
  les?: string; vak?: string; vakReden?: string;
  lesdoelen?: { id: number; tekst: string; dekking: string }[];
  kaarten?: { lesdoel: number; vraag: string; antwoord: string | null; bron: string; letOp: string | null }[];
  ontbreekt?: string[]; tegenstrijdig?: string[];
}

/** Luna gets this long; the rest of the 300 s function budget is left for the Sol redo. */
const FIRST_PASS_MS = 120_000;
const REDO_MS = 150_000;

/** True when the text holds at least one URL on a trusted (Dutch) domain. */
export function hasTrustedUrl(bron: string) {
  return (bron.match(/https?:\/\/[^\s)"'<>]+/g) ?? []).some((u) => {
    try {
      const host = new URL(u).hostname.toLowerCase();
      return TRUSTED_DOMAINS.some((d) => host === d || host.endsWith("." + d));
    } catch { return false; }
  });
}

/** Goals a first pass covered badly: not fully covered, no cards, or an answer without a trusted source URL. */
export function weakGoals(out: WebOut): number[] {
  const goals = out.lesdoelen ?? [];
  const cards = out.kaarten ?? [];
  return goals.filter((g) => {
    const own = cards.filter((k) => k.lesdoel === g.id);
    return g.dekking !== "volledig" || !own.length || own.some((k) => k.antwoord != null && !hasTrustedUrl(k.bron));
  }).map((g) => g.id);
}

/** First pass with the redone goals swapped in from the second. */
export function mergeRedo(first: WebOut, redo: WebOut, ids: number[]): WebOut {
  const redone = new Set(ids);
  return {
    ...first,
    lesdoelen: (first.lesdoelen ?? []).map((g) => redone.has(g.id) ? { ...g, dekking: redo.lesdoelen?.find((r) => r.id === g.id)?.dekking ?? g.dekking } : g),
    kaarten: [
      ...(first.kaarten ?? []).filter((k) => !redone.has(k.lesdoel)),
      ...(redo.kaarten ?? []).filter((k) => redone.has(k.lesdoel)),
    ].sort((a, b) => (a.lesdoel || Infinity) - (b.lesdoel || Infinity)),
    // the first pass's gaps were about the redone goals
    ontbreekt: redo.ontbreekt ?? [],
    tegenstrijdig: [...(first.tegenstrijdig ?? []), ...(redo.tegenstrijdig ?? [])],
  };
}

interface Input { goals: string; goalsAsImage: boolean; images: { dataUrl: string }[]; imageLabels: string[]; subjects: SubjectRef[]; cacheKey: string }

async function pass(input: Input, task: TaskModel, only: number[] | undefined, timeout: number, meta: Record<string, unknown>) {
  const goalCount = only?.length || input.goals.split("\n").filter((l) => l.trim()).length || 15;
  const prompt = webCardsPrompt({ goals: input.goals, goalsAsImage: input.goalsAsImage, imageLabels: input.imageLabels, subjects: input.subjects, only });
  const res = await openai().responses.create(
    cardsRequest({ task, prompt, images: input.images, subjectKeys: input.subjects.map((s) => s.key), web: true, goalCount, cacheKey: input.cacheKey }),
    { timeout, maxRetries: 0 },
  );
  const searches = res.output.filter((o) => o.type === "web_search_call").length;
  const usage = logUsage("generate", task.model, res.usage, { ...meta, mode: "web", redo: only?.length ?? 0, status: res.status, searches });
  if (res.status !== "completed") throw new Error(`status ${res.status}`);
  const out = JSON.parse(res.output_text) as WebOut;
  if (!Array.isArray(out.kaarten) || !out.kaarten.length) throw new Error("no cards");
  return { out, usage };
}

/**
 * Goals-only research, cheapest model first: Luna researches every goal; goals it covered badly
 * (see weakGoals) are redone by Sol and merged in. If Luna fails outright, Sol does the whole lesson.
 */
export async function researchGoals(input: Input, onStep: (msg: string) => void, meta: Record<string, unknown> = {}) {
  const usage: Usage[] = [];
  let first: WebOut | null = null;
  try {
    const r = await pass(input, TASKS.cardsWeb, undefined, FIRST_PASS_MS, meta);
    first = r.out;
    usage.push(r.usage);
  } catch (e) {
    console.error("[research] first pass failed", e);
  }

  const weak = first ? weakGoals(first) : [];
  if (first && !weak.length) return { out: first, usage };

  onStep(first ? `Extra zoeken voor lesdoel ${weak.join(", ")}…` : "Opnieuw zoeken met een sterker model…");
  try {
    const r = await pass(input, TASKS.cardsWebRedo, first ? weak : undefined, REDO_MS, meta);
    usage.push(r.usage);
    return { out: first ? mergeRedo(first, r.out, weak) : r.out, usage };
  } catch (e) {
    // a weaker first pass beats no cards at all
    if (first) { console.error("[research] redo failed, keeping first pass", e); return { out: first, usage }; }
    throw e;
  }
}
