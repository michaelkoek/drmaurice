import { sql } from "@/lib/db";
import { ApiError, errorResponse, requirePaidUser, requireUser } from "@/lib/openai";
import { parseSubscription, sendPush } from "@/lib/push";

/**
 * Study-reminder subscriptions of this device.
 * POST { op: "subscribe", subscription, replaces? } · { op: "unsubscribe", endpoint } · { op: "test", endpoint }
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    // signing out must always be able to drop the device, also when access lapsed
    const user = body?.op === "unsubscribe" ? await requireUser() : await requirePaidUser();
    const db = sql();

    if (body?.op === "subscribe") {
      const sub = parseSubscription(body.subscription);
      if (!sub) throw new ApiError(400, "bad_request", "Ongeldig abonnement voor meldingen.");
      // the browser rotated the subscription (pushsubscriptionchange): drop the old one
      if (typeof body.replaces === "string") await db.query(`delete from push_subscriptions where endpoint = $1 and user_id = $2`, [body.replaces, user.id]);
      // one row per device; a device that someone else used before now belongs to this user
      await db.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)
         on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
        [user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth],
      );
      return Response.json({ ok: true });
    }

    if (body?.op === "unsubscribe") {
      if (typeof body.endpoint !== "string") throw new ApiError(400, "bad_request", "endpoint ontbreekt.");
      await db.query(`delete from push_subscriptions where endpoint = $1 and user_id = $2`, [body.endpoint, user.id]);
      return Response.json({ ok: true });
    }

    if (body?.op === "test") {
      const [row] = await db.query(`select endpoint, p256dh, auth from push_subscriptions where endpoint = $1 and user_id = $2`, [String(body.endpoint ?? ""), user.id]);
      if (!row) throw new ApiError(404, "not_found", "Meldingen staan niet aan op dit apparaat.");
      const ok = await sendPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, {
        title: "Meldingen staan aan",
        body: "Zo ziet een herinnering eruit. Je krijgt er hooguit één per dag, alleen als er een toets aankomt.",
        url: "/instellingen",
        tag: "test",
      });
      if (!ok) throw new ApiError(502, "push_failed", "De testmelding kon niet verstuurd worden. Zet meldingen uit en weer aan.");
      return Response.json({ ok: true });
    }

    throw new ApiError(400, "bad_request", "Onbekende actie.");
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    console.error("[push]", e);
    return Response.json({ code: "db_error", message: "Er ging iets mis. Probeer het opnieuw." }, { status: 500 });
  }
}
