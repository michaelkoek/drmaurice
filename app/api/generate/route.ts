import { ApiError, TASKS, cardsRequest, checkImages, errorResponse, logUsage, openai, requireUser, str } from "@/lib/openai";
import { cardsPrompt, webCardsPrompt, type SubjectRef } from "@/lib/prompts";
import { researchGoals } from "@/lib/research";

// Long lessons with images (or web research) can take a couple of minutes.
export const maxDuration = 300;

/**
 * Streams the model's JSON as plain text so the page can show progress; the page parses it at the end.
 * mode "web" = learning goals without a presentation: the model researches them with web search on TRUSTED_DOMAINS
 * (Dutch sites only, PRIORITY_DOMAINS first), Luna first and Sol only for badly covered goals (lib/research.ts).
 * That JSON is sent in one piece at the end, preceded by "\u0001<status>\n" progress lines.
 * After the JSON, "\u0000USAGE" + the token usage of every call (array) is appended (see lib/generate.ts).
 */
export async function POST(req: Request) {
  type Ev = { type: string; delta?: string; response?: { error?: { message?: string }; usage?: Parameters<typeof logUsage>[2]; output?: { type: string }[] } };
  let stream: AsyncIterable<Ev>;
  let m = "", meta: Record<string, unknown> = {};
  try {
    const user = await requireUser();
    const body = await req.json();
    const subjects: SubjectRef[] = (Array.isArray(body.subjects) ? body.subjects : []).slice(0, 6).map((s: Record<string, unknown>, i: number) => ({
      key: `v${i}`, name: String(s.name ?? "").slice(0, 60), hint: s.hint ? String(s.hint).slice(0, 200) : null,
    }));
    if (!subjects.length) throw new ApiError(400, "bad_request", "Maak eerst vakken aan.");
    const images = checkImages(body.images);
    const web = body.mode === "web";
    const goals = str(body.goals, 8000);
    const goalsAsImage = !!body.goalsAsImage;
    const imageLabels = images.map((i, n) => `Afbeelding ${n + 1} = ${i.label}`);
    if (web && !goals.trim() && !(goalsAsImage && images.length)) throw new ApiError(400, "bad_request", "Geef eerst de lesdoelen op.");
    const prompt = web
      ? webCardsPrompt({ goals, goalsAsImage, imageLabels, subjects })
      : cardsPrompt({ goals, goalsAsImage, digest: str(body.digest, 60000), imageLabels, subjects });
    const task = TASKS.cardsSlides;
    m = task.model;
    meta = { mode: web ? "web" : "slides", images: images.length, chars: prompt.length };
    if (process.env.NODE_ENV !== "production" && process.env.OPENAI_EVAL_DUMP === "1") {
      // dev only: keep real lessons as inputs for `npm run eval:models`
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(".eval/inputs", { recursive: true });
      await writeFile(`.eval/inputs/${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        JSON.stringify({ mode: meta.mode, goals, goalsAsImage, digest: web ? "" : body.digest, images, subjects }));
    }
    if (web) return researchResponse({ goals, goalsAsImage, images, imageLabels, subjects, cacheKey: user.id }, meta);
    stream = (await openai().responses.create({
      ...cardsRequest({ task, prompt, images, subjectKeys: subjects.map((s) => s.key), web: false, goalCount: 0, cacheKey: user.id }),
      stream: true,
    })) as unknown as typeof stream;
  } catch (e) {
    return errorResponse(e);
  }

  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try {
        for await (const ev of stream) {
          if (ev.type === "response.output_text.delta" && ev.delta) ctrl.enqueue(enc.encode(ev.delta));
          else if (ev.type === "response.failed" || ev.type === "error") throw new Error(ev.response?.error?.message || "failed");
          else if (ev.type === "response.incomplete") {
            logUsage("generate", m, ev.response?.usage, { ...meta, incomplete: true }); // still billed
            throw new Error("incomplete");
          }
          else if (ev.type === "response.completed") {
            const searches = ev.response?.output?.filter((o) => o.type === "web_search_call").length ?? 0;
            const usage = logUsage("generate", m, ev.response?.usage, { ...meta, searches });
            ctrl.enqueue(enc.encode("\u0000USAGE" + JSON.stringify([usage])));
          }
        }
      } catch (e) {
        console.error(e);
        // the status is already sent; mark the failure in-band
        ctrl.enqueue(enc.encode("\u0000ERROR"));
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

function researchResponse(input: Parameters<typeof researchGoals>[0], meta: Record<string, unknown>) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      try {
        const { out, usage } = await researchGoals(input, (msg) => ctrl.enqueue(enc.encode("\u0001" + msg + "\n")), meta);
        ctrl.enqueue(enc.encode(JSON.stringify(out) + "\u0000USAGE" + JSON.stringify(usage)));
      } catch (e) {
        console.error(e);
        ctrl.enqueue(enc.encode("\u0000ERROR"));
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
