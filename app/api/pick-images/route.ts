import { ApiError, errorResponse, logUsage, model, openai, requireUser, str } from "@/lib/openai";
import { pickImagesPrompt, pickImagesSchema } from "@/lib/prompts";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const max = Math.max(1, Math.min(10, Number(body.max) || 6));
    const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 200).map((c: Record<string, unknown>) => ({
      id: String(c.id).slice(0, 12), slide: Number(c.slide) || 0, title: String(c.title ?? "").slice(0, 80), kb: Number(c.kb) || 0,
    })) : [];
    if (!candidates.length) throw new ApiError(400, "bad_request", "Geen afbeeldingen.");
    const m = model(true);
    const res = await openai().responses.create({
      model: m,
      input: pickImagesPrompt({ goals: str(body.goals, 8000), digest: str(body.digest, 40000), candidates, max }),
      // choosing images needs no deliberation; reasoning tokens are billed as output
      reasoning: { effort: "none" },
      text: { format: { type: "json_schema", name: "image_pick", schema: pickImagesSchema as unknown as Record<string, unknown>, strict: true }, verbosity: "low" },
      prompt_cache_key: user.id,
      prompt_cache_retention: "24h",
      max_output_tokens: 1000,
    });
    const usage = logUsage("pick-images", m, res.usage, { candidates: candidates.length });
    const parsed = JSON.parse(res.output_text || "{}") as { ids?: string[] };
    const valid = new Set(candidates.map((c: { id: string }) => c.id));
    return Response.json({ ids: (parsed.ids ?? []).filter((id) => valid.has(id)).slice(0, max), usage });
  } catch (e) {
    return errorResponse(e);
  }
}
