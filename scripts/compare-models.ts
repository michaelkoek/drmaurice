/**
 * Runs saved lessons through several models so card quality can be compared before switching TASKS in lib/openai.ts.
 *   1. OPENAI_EVAL_DUMP=1 npm run dev, upload a few real lessons (each lands in .eval/inputs/)
 *   2. npm run eval:models [model:effort ...]   default: gpt-6-luna:low gpt-6-luna:medium gpt-6.1-sol:low
 *   3. open .eval/out/<lesson>.html: one column per model, cards grouped by learning goal
 * Costs real OpenAI credit (each lesson × each model). Reads OPENAI_API_KEY from .env.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { cardsRequest, logUsage, openai, type TaskModel } from "@/lib/openai";
import { cardsPrompt, webCardsPrompt, type SubjectRef } from "@/lib/prompts";
import type { Usage } from "@/lib/types";

/** $ per 1M tokens: input, cached input, output (reasoning is billed as output). Web search calls are not included. */
const PRICES: Record<string, [number, number, number]> = {
  "gpt-6-luna": [0.1, 0.01, 0.5],
  "gpt-6-sol": [2, 0.2, 10],
  "gpt-6.1-sol": [2, 0.2, 10],
  "gpt-6-astra": [10, 1, 50],
};

interface Input { mode: "slides" | "web"; goals: string; goalsAsImage: boolean; digest: string; images: { dataUrl: string; label: string }[]; subjects: SubjectRef[] }
interface Card { lesdoel: number; vraag: string; antwoord: string | null; bron: string; letOp: string | null }
interface Out { lesdoelen?: { id: number; tekst: string; dekking: string }[]; kaarten?: Card[]; ontbreekt?: string[]; tegenstrijdig?: string[] }
interface Run { label: string; out: Out | null; error?: string; usage: Usage | null; cost: number; seconds: number }

const DEFAULT = ["gpt-6-luna:low", "gpt-6-luna:medium", "gpt-6.1-sol:low"];

function cost(u: Usage) {
  const p = PRICES[u.model];
  if (!p) return NaN;
  return ((u.input - u.cached) * p[0] + u.cached * p[1] + u.output * p[2]) / 1e6;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function run(input: Input, task: TaskModel): Promise<Run> {
  const label = `${task.model}:${task.effort}`;
  const web = input.mode === "web";
  const imageLabels = input.images.map((i, n) => `Afbeelding ${n + 1} = ${i.label}`);
  const prompt = web
    ? webCardsPrompt({ goals: input.goals, goalsAsImage: input.goalsAsImage, imageLabels, subjects: input.subjects })
    : cardsPrompt({ goals: input.goals, goalsAsImage: input.goalsAsImage, digest: input.digest, imageLabels, subjects: input.subjects });
  const goalCount = input.goals.split("\n").filter((l) => l.trim()).length || 15;
  const t0 = Date.now();
  try {
    const res = await openai().responses.create(cardsRequest({
      task, prompt, images: input.images, subjectKeys: input.subjects.map((s) => s.key), web, goalCount, cacheKey: "eval",
    }));
    const searches = res.output.filter((o) => o.type === "web_search_call").length;
    const usage = logUsage("eval", task.model, res.usage, { effort: task.effort, searches });
    const out = res.status === "completed" ? JSON.parse(res.output_text) as Out : null;
    return { label, out, error: out ? undefined : `status ${res.status}`, usage, cost: cost(usage), seconds: (Date.now() - t0) / 1000 };
  } catch (e) {
    return { label, out: null, error: (e as Error).message, usage: null, cost: 0, seconds: (Date.now() - t0) / 1000 };
  }
}

function html(name: string, input: Input, runs: Run[]) {
  const goalIds = [...new Set(runs.flatMap((r) => [...(r.out?.lesdoelen ?? []).map((g) => g.id), ...(r.out?.kaarten ?? []).map((k) => k.lesdoel)]))].sort((a, b) => a - b);
  const goalText = (id: number) => id === 0 ? "Buiten de lesdoelen" : runs.map((r) => r.out?.lesdoelen?.find((g) => g.id === id)?.tekst).find(Boolean) ?? `Lesdoel ${id}`;
  const head = runs.map((r) => {
    const cards = r.out?.kaarten ?? [];
    const cov = (d: string) => (r.out?.lesdoelen ?? []).filter((g) => g.dekking === d).length;
    return `<th><b>${esc(r.label)}</b><br>${r.error ? `<span class=err>${esc(r.error)}</span><br>` : ""}
      ${cards.length} kaarten · ${cards.filter((c) => c.antwoord === null).length} gaten<br>
      dekking ${cov("volledig")} volledig / ${cov("deels")} deels / ${cov("geen")} geen<br>
      ${r.usage ? `${r.usage.input} in (${r.usage.cached} cached) · ${r.usage.output} out (${r.usage.reasoning} reasoning)${r.usage.searches ? ` · ${r.usage.searches} zoekopdrachten` : ""}<br>` : ""}
      <b>$${r.cost.toFixed(4)}</b> · ${r.seconds.toFixed(0)} s</th>`;
  }).join("");
  const card = (c: Card) => `<div class="card${c.antwoord === null ? " gap" : ""}"><b>${esc(c.vraag)}</b>
    <div>${c.antwoord === null ? "<i>geen antwoord in de stof</i>" : esc(c.antwoord)}</div>
    <small>${esc(c.bron)}</small>${c.letOp ? `<div class=let>Let op: ${esc(c.letOp)}</div>` : ""}</div>`;
  const rows = goalIds.map((id) => `<tr><td colspan=${runs.length} class=goal>${id ? `${id}. ` : ""}${esc(goalText(id))}
      ${runs.map((r) => { const g = r.out?.lesdoelen?.find((x) => x.id === id); return g ? `<span class=tag>${esc(r.label)}: ${esc(g.dekking)}</span>` : ""; }).join("")}</td></tr>
    <tr>${runs.map((r) => `<td>${(r.out?.kaarten ?? []).filter((k) => k.lesdoel === id).map(card).join("")}</td>`).join("")}</tr>`).join("");
  const notes = (key: "ontbreekt" | "tegenstrijdig") => `<tr><td colspan=${runs.length} class=goal>${key}</td></tr>
    <tr>${runs.map((r) => `<td><ul>${(r.out?.[key] ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></td>`).join("")}</tr>`;
  return `<!doctype html><meta charset=utf-8><title>${esc(name)}</title>
<style>
body{font:14px system-ui;margin:16px;background:#fff;color:#222}table{border-collapse:collapse;width:100%;table-layout:fixed}
th,td{border:1px solid #ddd;padding:8px;vertical-align:top;text-align:left}th{position:sticky;top:0;background:#f6f6f6}
.goal{background:#eef3fb;font-weight:600}.tag{font-weight:400;font-size:12px;margin-left:8px;color:#555}
.card{border-bottom:1px solid #eee;padding:6px 0}.card small{color:#777}.gap{background:#fff5e6}.let{color:#a40}.err{color:#c00}
details{margin-bottom:12px}pre{white-space:pre-wrap;font-size:12px}
</style>
<h1>${esc(name)} · ${input.mode} · ${input.images.length} afbeeldingen</h1>
<details><summary>Lesdoelen (input)</summary><pre>${esc(input.goals || "(geen / als afbeelding)")}</pre></details>
<table><tr>${head}</tr>${rows}${notes("ontbreekt")}${notes("tegenstrijdig")}</table>`;
}

async function main() {
  const tasks: TaskModel[] = (process.argv.length > 2 ? process.argv.slice(2) : DEFAULT).map((s) => {
    const [model, effort = "low"] = s.split(":");
    return { model, effort: effort as TaskModel["effort"] };
  });
  const files = (await readdir(".eval/inputs").catch(() => [])).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) throw new Error("No inputs in .eval/inputs. Run `OPENAI_EVAL_DUMP=1 npm run dev` and upload a lesson first.");
  await mkdir(".eval/out", { recursive: true });
  const totals = new Map<string, number>();
  for (const f of files) {
    const input = JSON.parse(await readFile(`.eval/inputs/${f}`, "utf8")) as Input;
    console.log(`\n${f} (${input.mode})`);
    const runs = await Promise.all(tasks.map((t) => run(input, t)));
    for (const r of runs) {
      totals.set(r.label, (totals.get(r.label) ?? 0) + r.cost);
      console.log(`  ${r.label.padEnd(22)} ${String(r.out?.kaarten?.length ?? "-").padStart(3)} kaarten  $${r.cost.toFixed(4)}  ${r.seconds.toFixed(0)}s${r.error ? `  ${r.error}` : ""}`);
    }
    const out = `.eval/out/${f.replace(/\.json$/, "")}.html`;
    await writeFile(out, html(f, input, runs));
    console.log(`  → ${out}`);
  }
  console.log("\nTotal per model:");
  for (const [label, c] of totals) console.log(`  ${label.padEnd(22)} $${c.toFixed(4)}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
