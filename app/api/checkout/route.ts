import { hasAccess } from "@/lib/access";
import { ApiError, errorResponse, requireUser } from "@/lib/openai";
import { stripe } from "@/lib/stripe";

/** Starts a Stripe Checkout for the one-time access fee and returns its URL. */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (hasAccess(user)) throw new ApiError(409, "already_paid", "Je hebt al toegang.");
    const body = (await request.json().catch(() => null)) as { waiver?: unknown } | null;
    // digital content delivered right away: the buyer must waive the 14-day withdrawal right (art. 6:230p BW)
    if (body?.waiver !== true) throw new ApiError(400, "waiver_required", "Vink aan dat je direct toegang wilt.");
    const price = process.env.STRIPE_PRICE_ID;
    if (!price) throw new Error("STRIPE_PRICE_ID ontbreekt op de server.");

    const origin = new URL(request.url).origin;
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      customer_email: user.email,
      metadata: { userId: user.id, waiver: "accepted" },
      locale: "nl",
      // label to find this flow in the Dashboard; payment methods stay dynamic (never pass payment_method_types)
      integration_identifier: "drmauricecards-access-qhvzrmtk",
      success_url: `${origin}/betalen/gelukt?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/betalen`,
    });
    if (!session.url) throw new Error("Stripe gaf geen checkout-URL terug.");
    return Response.json({ url: session.url });
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e);
    console.error("[checkout]", e);
    return Response.json({ code: "checkout_failed", message: "Betalen starten lukte niet. Probeer het later opnieuw." }, { status: 502 });
  }
}
