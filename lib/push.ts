import "server-only";
import webpush from "web-push";
import { sql } from "./db";
import type { PushMessage } from "./reminder";

/**
 * Push services browsers hand out endpoints for. The server POSTs to the endpoint a client sends,
 * so anything else is refused: otherwise a client could make the server call arbitrary URLs.
 */
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.apple.com", "push.services.mozilla.com", "notify.windows.com"];

export interface PushSubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }

/** Validates a PushSubscription as serialized by the browser (`JSON.stringify(sub)`). */
export function parseSubscription(raw: unknown): PushSubscriptionInput | null {
  const s = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 1000) return null;
  const { p256dh, auth } = s.keys ?? {};
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  if (!isPushEndpoint(s.endpoint)) return null;
  return { endpoint: s.endpoint, keys: { p256dh, auth } };
}

export function isPushEndpoint(endpoint: string) {
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  return u.protocol === "https:" && !u.port && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
}

let configured = false;
function configure() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY ontbreken op de server.");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:beheer@drmauricecards.nl", pub, priv);
  configured = true;
}

/** Sends one notification; a subscription the push service no longer knows (404/410) is deleted. Returns whether it was delivered. */
export async function sendPush(sub: PushSubscriptionInput, msg: PushMessage): Promise<boolean> {
  configure();
  try {
    // urgency normal + 12 h TTL: a reminder that arrives the next morning is no use
    await webpush.sendNotification(sub, JSON.stringify(msg), { TTL: 12 * 3600, urgency: "normal", topic: msg.tag });
    return true;
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await sql().query(`delete from push_subscriptions where endpoint = $1`, [sub.endpoint]);
    else console.error("[push]", status, (e as Error).message);
    return false;
  }
}
