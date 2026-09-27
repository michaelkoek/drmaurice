"use client";
import { useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Btn, Field, Panel, inputCls } from "@/components/ui";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const site = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    // same message whether or not the address exists
    await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${site}/auth/confirm?next=/wachtwoord` });
    setBusy(false); setSent(true);
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center px-4 py-10">
      <h1 className="mb-4 font-display text-2xl font-bold">Wachtwoord vergeten</h1>
      <Panel className="p-5 shadow-card">
        {sent ? (
          <p className="text-sm">Als dit adres een account heeft, staat er een e-mail met een link om een nieuw wachtwoord te kiezen.</p>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <Field label="E-mailadres"><input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
            <Btn variant="primary" type="submit" disabled={busy}>Stuur link</Btn>
          </form>
        )}
      </Panel>
      <Link href="/login" className="mt-4 text-center text-[13px] text-muted underline underline-offset-2">Terug naar inloggen</Link>
    </main>
  );
}
