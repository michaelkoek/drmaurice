import Link from "next/link";
import { redirect } from "next/navigation";
import { hasAccess } from "@/lib/access";
import { currentUser } from "@/lib/auth";
import { markPaid, stripe } from "@/lib/stripe";
import { Panel } from "@/components/ui";

/** Stripe sends the buyer here. Unlock right away if the session is paid, so nobody waits on the webhook. */
export default async function PaidPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  let paid = hasAccess(user);
  const { session_id } = await searchParams;
  if (!paid && session_id?.startsWith("cs_")) {
    try {
      const session = await stripe().checkout.sessions.retrieve(session_id);
      // only the buyer's own session may unlock their account
      if (session.client_reference_id === user.id) paid = await markPaid(session);
    } catch (e) {
      console.error("[betalen/gelukt]", e);
    }
  }
  if (paid) redirect("/");

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center px-4 py-10">
      <Panel className="grid gap-3 p-5 shadow-card">
        <h1 className="font-display text-xl font-bold">Betaling wordt verwerkt</h1>
        <p className="text-[14px] text-muted">Dit duurt meestal een paar seconden. Ververs deze pagina zo meteen. Lukt het niet? Probeer opnieuw te betalen.</p>
        <div className="flex gap-3 text-[14px] font-semibold">
          <Link href={`/betalen/gelukt${session_id ? `?session_id=${encodeURIComponent(session_id)}` : ""}`} className="underline underline-offset-2">Opnieuw controleren</Link>
          <Link href="/betalen" className="text-muted underline underline-offset-2">Terug</Link>
        </div>
      </Panel>
    </main>
  );
}
