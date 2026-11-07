export const FEEDBACK_KINDS = [
  { id: "idee", label: "Idee of nieuwe functie" },
  { id: "probleem", label: "Iets werkt niet" },
  { id: "anders", label: "Anders" },
] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["id"];
export const FEEDBACK_MAX = 4000;
/** Per user per 24 hours, against spam. */
export const FEEDBACK_PER_DAY = 10;

/** Validates a submission; same limits as the check constraints in db/migrations/002. */
export function parseFeedback(raw: unknown): { kind: FeedbackKind; message: string } | { error: string } {
  const body = (raw ?? {}) as { kind?: unknown; message?: unknown };
  const kind = FEEDBACK_KINDS.find((k) => k.id === body.kind)?.id;
  if (!kind) return { error: "Kies een soort feedback." };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return { error: "Schrijf eerst je feedback." };
  if (message.length > FEEDBACK_MAX) return { error: `Maximaal ${FEEDBACK_MAX} tekens.` };
  return { kind, message };
}
