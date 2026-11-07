import { sql } from "@/lib/db";
import { FEEDBACK_PER_DAY, parseFeedback } from "@/lib/feedback";
import { ApiError, errorResponse, requireUser } from "@/lib/openai";

/** Feature ideas and bug reports; read by admins on /beheer. Unpaid users may send too (e.g. payment trouble). */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = parseFeedback(await request.json().catch(() => null));
    if ("error" in parsed) throw new ApiError(400, "bad_request", parsed.error);
    const db = sql();
    const [{ n }] = await db.query(`select count(*)::int as n from feedback where user_id = $1 and created_at > now() - interval '1 day'`, [user.id]);
    if (n >= FEEDBACK_PER_DAY) throw new ApiError(429, "rate_limited", "Je hebt vandaag al veel feedback gestuurd. Probeer het morgen opnieuw.");
    await db.query(`insert into feedback (user_id, kind, message) values ($1, $2, $3)`, [user.id, parsed.kind, parsed.message]);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    console.error("[feedback]", e);
    return Response.json({ code: "db_error", message: "Versturen lukte niet. Probeer het opnieuw." }, { status: 500 });
  }
}
