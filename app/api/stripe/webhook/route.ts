import type Stripe from "stripe";
import { markPaid, stripe } from "@/lib/stripe";

/**
 * Stripe calls this after a payment; there is no user session, the signature is the proof.
 * Events: checkout.session.completed (card, iDEAL), checkout.session.async_payment_succeeded and
 * checkout.session.async_payment_failed (delayed methods such as SEPA).
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await request.text(), signature, secret);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    // markPaid ignores sessions that are not paid yet (async methods complete later)
    await markPaid(event.data.object);
  } else if (event.type === "checkout.session.async_payment_failed") {
    // nothing was unlocked yet; the student can try again on /betalen
    console.warn("[stripe] async payment failed", event.data.object.id, event.data.object.client_reference_id);
  }
  return Response.json({ received: true });
}
