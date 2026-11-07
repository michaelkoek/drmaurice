"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Btn, Panel } from "@/components/ui";

export function PayForm({ email }: { email: string }) {
  const [waiver, setWaiver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!waiver) return setError("Vink aan dat je direct toegang wilt.");
    setBusy(true); setError(null);
    const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ waiver }) }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { url?: string; code?: string; message?: string } | null;
    if (res?.ok && json?.url) { window.location.href = json.url; return; }
    setBusy(false);
    if (json?.code === "already_paid") { window.location.href = "/"; return; }
    setError(json?.message ?? "Betalen starten lukte niet. Controleer je verbinding.");
  }

  async function signOut() {
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <img src="/icon.svg" alt="" className="size-10" />
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight">Toegang activeren</h1>
          <p className="text-sm text-muted">DrMauriceCards</p>
        </div>
      </div>
      <Panel className="p-5 shadow-card">
        <form onSubmit={pay} className="grid gap-4">
          <div>
            <p className="font-display text-3xl font-bold">€5 <span className="text-base font-medium text-muted">eenmalig</span></p>
            <ul className="mt-3 grid gap-1.5 text-[14px]">
              <li>✓ Flashcards uit je colleges en lesdoelen</li>
              <li>✓ Oefenen per tentamen en onderwerp</li>
              <li>✓ Geen abonnement, je betaalt maar één keer</li>
            </ul>
          </div>
          <label className="flex items-start gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={waiver} onChange={(e) => setWaiver(e.target.checked)} className="mt-1 accent-accent" />
            <span>Ik wil direct toegang en weet dat ik daardoor mijn herroepingsrecht van 14 dagen verlies.</span>
          </label>
          {error && <p role="alert" className="text-[13px] text-eosin">{error}</p>}
          <Btn variant="primary" type="submit" disabled={busy}>{busy ? "Bezig…" : "Betalen met iDEAL of kaart"}</Btn>
          <p className="text-center text-[12px] text-muted">Je betaalt veilig via Stripe.</p>
        </form>
      </Panel>
      <p className="mt-4 text-center text-[13px] text-muted">
        Ingelogd als {email} · <button onClick={signOut} className="font-semibold text-ink underline underline-offset-2">Uitloggen</button>
      </p>
    </main>
  );
}
