import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasAccess, isAdmin } from "@/lib/access";
import { parseFeedback } from "@/lib/feedback";

vi.mock("server-only", () => ({}));
const markPaid = vi.fn(async () => true);
vi.mock("@/lib/stripe", () => ({ markPaid, stripe: () => new Stripe("sk_test_dummy") }));
const { POST: webhook } = await import("@/app/api/stripe/webhook/route");

describe("access", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("needs paidAt or an allowlisted email", () => {
    vi.stubEnv("FREE_ACCESS_EMAILS", " Vriend@Example.com , ");
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    expect(hasAccess(null)).toBe(false);
    expect(hasAccess({ email: "nieuw@example.com", paidAt: null })).toBe(false);
    expect(hasAccess({ email: "nieuw@example.com", paidAt: new Date() })).toBe(true);
    expect(hasAccess({ email: "vriend@example.com" })).toBe(true);
    expect(hasAccess({ email: "admin@example.com" })).toBe(true);
    expect(isAdmin({ email: "ADMIN@example.com" })).toBe(true);
    expect(isAdmin({ email: "vriend@example.com" })).toBe(false);
  });

  it("gives nobody free access when the lists are empty", () => {
    vi.stubEnv("FREE_ACCESS_EMAILS", "");
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(hasAccess({ email: "" })).toBe(false);
    expect(isAdmin({ email: "" })).toBe(false);
  });
});

describe("feedback", () => {
  it("validates kind and message", () => {
    expect(parseFeedback({ kind: "idee", message: "  Anki-export  " })).toEqual({ kind: "idee", message: "Anki-export" });
    expect(parseFeedback({ kind: "spam", message: "x" })).toHaveProperty("error");
    expect(parseFeedback({ kind: "idee", message: "   " })).toHaveProperty("error");
    expect(parseFeedback({ kind: "idee", message: "x".repeat(4001) })).toHaveProperty("error");
    expect(parseFeedback(null)).toHaveProperty("error");
  });
});

describe("stripe webhook", () => {
  const secret = "whsec_test";
  beforeEach(() => { vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret); markPaid.mockClear(); });
  afterEach(() => vi.unstubAllEnvs());

  const event = (type: string) => JSON.stringify({
    id: "evt_1", object: "event", type,
    data: { object: { id: "cs_test_1", object: "checkout.session", client_reference_id: "u1", payment_status: "paid", amount_total: 500, currency: "eur" } },
  });
  const send = (payload: string, signature: string) =>
    webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));

  it("unlocks the account for a correctly signed completed checkout", async () => {
    const payload = event("checkout.session.completed");
    const res = await send(payload, new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({ payload, secret }));
    expect(res.status).toBe(200);
    expect(markPaid).toHaveBeenCalledWith(expect.objectContaining({ id: "cs_test_1", client_reference_id: "u1" }));
  });

  it("rejects a bad signature", async () => {
    const payload = event("checkout.session.completed");
    const res = await send(payload, new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({ payload, secret: "whsec_other" }));
    expect(res.status).toBe(400);
    expect(markPaid).not.toHaveBeenCalled();
  });

  it("ignores unrelated events", async () => {
    const payload = event("customer.created");
    const res = await send(payload, new Stripe("sk_test_dummy").webhooks.generateTestHeaderString({ payload, secret }));
    expect(res.status).toBe(200);
    expect(markPaid).not.toHaveBeenCalled();
  });
});
