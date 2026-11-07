import "server-only";
import Stripe from "stripe";
import { sql } from "./db";

// created on first use so `next build` works without STRIPE_SECRET_KEY
let client: Stripe | null = null;
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY ontbreekt op de server.");
  return (client ??= new Stripe(key));
}

/** Records a paid Checkout session and unlocks the account. Safe to call twice (webhook + success page). */
export async function markPaid(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  if (!userId || session.payment_status !== "paid") return false;
  const db = sql();
  await db.query(
    `insert into payments (user_id, stripe_session_id, amount, currency) values ($1, $2, $3, $4) on conflict (stripe_session_id) do nothing`,
    [userId, session.id, session.amount_total ?? 0, session.currency ?? "eur"],
  );
  await db.query(`update "user" set "paidAt" = coalesce("paidAt", now()) where id = $1`, [userId]);
  return true;
}
