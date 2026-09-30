import { ApiError, checkImages, errorResponse, logUsage, model, openai, requireUser, str } from "@/lib/openai";
import { TRUSTED_DOMAINS, cardsPrompt, cardsSchema, webCardsPrompt, type SubjectRef } from "@/lib/prompts";

// Long lessons with images (or web research) can take a couple of minutes.
export const maxDuration = 300;

/** Hard cap incl. reasoning tokens; 60 cards need well under half of this. */
const MAX_OUTPUT_TOKENS = 24_000;

/**
 * Streams the model's JSON as plain text so the page can show progress; the page parses it at the end.
 * mode "web" = learning goals without a presentation: the model researches them with web search on TRUSTED_DOMAINS.
 * After the JSON, "\u0000USAGE" + the token usage is appended (see lib/generate.ts).
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
    // web search budget: about two searches per learning goal (goals as an image: assume many)
    const goalCount = goals.split("\n").filter((l) => l.trim()).length || 15;
    m = model();
    meta = { mode: web ? "web" : "slides", images: images.length, chars: prompt.length };
    stream = (await openai().responses.create({
      model: m,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...images.map((i) => ({ type: "input_image" as const, image_url: i.dataUrl, detail: "auto" as const })),
        ],
      }],
      ...(web && {
        tools: [{ type: "web_search" as const, filters: { allowed_domains: TRUSTED_DOMAINS }, search_context_size: "low" as const }],
        max_tool_calls: Math.min(40, Math.max(6, goalCount * 2)),
      }),
      // card writing is mostly extraction; reasoning tokens are billed as output
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "flashcards", schema: cardsSchema(subjects.map((s) => s.key)), strict: true }, verbosity: "low" },
      // same user + same upload = same prefix, so a retry is billed mostly at the cached rate
      prompt_cache_key: user.id,
      prompt_cache_retention: "24h",
      max_output_tokens: MAX_OUTPUT_TOKENS,
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
            ctrl.enqueue(enc.encode("\u0000USAGE" + JSON.stringify(usage)));
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
