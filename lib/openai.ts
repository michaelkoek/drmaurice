import "server-only";
import OpenAI from "openai";
import { currentUser } from "./auth";
import type { Usage } from "./types";

export function openai() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new ApiError(500, "missing_key", "OPENAI_API_KEY ontbreekt op de server.");
  return new OpenAI({ apiKey });
}

export function model(fast = false) {
  const m = (fast && process.env.OPENAI_MODEL_FAST) || process.env.OPENAI_MODEL;
  if (!m) throw new ApiError(500, "missing_model", "OPENAI_MODEL ontbreekt op de server.");
  return m;
}


type RawUsage = {
  input_tokens?: number; output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number };
} | null | undefined;

/** Logs one line per call so cost per upload can be read from the Vercel logs. */
export function logUsage(route: string, model: string, raw: RawUsage, extra: { searches?: number } & Record<string, unknown> = {}): Usage {
  const usage: Usage = {
    model,
    input: raw?.input_tokens ?? 0,
    cached: raw?.input_tokens_details?.cached_tokens ?? 0,
    output: raw?.output_tokens ?? 0,
    reasoning: raw?.output_tokens_details?.reasoning_tokens ?? 0,
    searches: extra.searches ?? 0,
  };
  console.log("[openai-usage]", JSON.stringify({ route, ...extra, ...usage }));
  return usage;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/** Only signed-in students may spend OpenAI credit. */
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "unauthorized", "Log eerst in.");
  return user;
}

export function errorResponse(e: unknown) {
  if (e instanceof ApiError) return Response.json({ code: e.code, message: e.message }, { status: e.status });
  const err = e as { status?: number; code?: string; message?: string };
  if (err?.status === 429) return Response.json({ code: "rate_limited", message: "OpenAI-limiet bereikt. Probeer het later opnieuw." }, { status: 429 });
  console.error(e);
  return Response.json({ code: "upstream_error", message: "Er ging iets mis bij OpenAI." }, { status: 502 });
}

const DATA_URL = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export function checkImages(images: unknown): { dataUrl: string; label: string }[] {
  if (images == null) return [];
  if (!Array.isArray(images) || images.length > 10) throw new ApiError(400, "bad_request", "Maximaal 10 afbeeldingen.");
  return images.map((i) => {
    const dataUrl = String((i as { dataUrl?: unknown })?.dataUrl ?? "");
    if (!DATA_URL.test(dataUrl) || dataUrl.length > 900_000) throw new ApiError(400, "bad_request", "Ongeldige afbeelding.");
    return { dataUrl, label: String((i as { label?: unknown })?.label ?? "").slice(0, 120) };
  });
}

export const str = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v : "";
  if (s.length > max) throw new ApiError(413, "too_large", "De presentatie is te groot om in één keer te verwerken.");
  return s;
};
