import { ApiError, checkImages, errorResponse, model, openai, requireUser, str } from "@/lib/openai";
import { cardsPrompt, cardsSchema, type SubjectRef } from "@/lib/prompts";

// Long lessons with images can take a couple of minutes.
export const maxDuration = 300;

/** Streams the model's JSON as plain text so the page can show progress; the page parses it at the end. */
export async function POST(req: Request) {
  let stream: AsyncIterable<{ type: string; delta?: string; response?: { error?: { message?: string } } }>;
  try {
    await requireUser();
    const body = await req.json();
    const subjects: SubjectRef[] = (Array.isArray(body.subjects) ? body.subjects : []).slice(0, 6).map((s: Record<string, unknown>, i: number) => ({
      key: `v${i}`, name: String(s.name ?? "").slice(0, 60), hint: s.hint ? String(s.hint).slice(0, 200) : null,
    }));
    if (!subjects.length) throw new ApiError(400, "bad_request", "Maak eerst vakken aan.");
    const images = checkImages(body.images);
    const prompt = cardsPrompt({
      goals: str(body.goals, 8000),
      goalsAsImage: !!body.goalsAsImage,
      digest: str(body.digest, 60000),
      imageLabels: images.map((i, n) => `Afbeelding ${n + 1} = ${i.label}`),
      subjects,
    });
    stream = (await openai().responses.create({
      model: model(),
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          ...images.map((i) => ({ type: "input_image" as const, image_url: i.dataUrl, detail: "auto" as const })),
        ],
      }],
      text: { format: { type: "json_schema", name: "flashcards", schema: cardsSchema(subjects.map((s) => s.key)), strict: true } },
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
          else if (ev.type === "response.incomplete") throw new Error("incomplete");
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
