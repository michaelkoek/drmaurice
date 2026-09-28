"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Btn, Field, Panel, inputCls } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (error) { setError(error.status === 429 ? "Te veel pogingen. Wacht even en probeer het opnieuw." : "E-mailadres of wachtwoord klopt niet."); return; }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <img src="/icon.svg" alt="" className="size-10" />
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight">DrMauriceCards</h1>
          <p className="text-sm text-muted">Flashcards uit je colleges</p>
        </div>
      </div>
      <Panel className="p-5 shadow-card">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="E-mailadres"><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
          <Field label="Wachtwoord"><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} /></Field>
          {error && <p role="alert" className="text-[13px] text-eosin">{error}</p>}
          <Btn variant="primary" type="submit" disabled={busy}>{busy ? "Bezig…" : "Inloggen"}</Btn>
        </form>
      </Panel>
      <p className="mt-4 text-center text-[13px] text-muted">
        Nog geen account? <Link href="/registreren" className="font-semibold text-ink underline underline-offset-2">Account aanmaken</Link>
        <br />Wachtwoord vergeten? Vraag de beheerder om een nieuw wachtwoord.
      </p>
    </main>
  );
}
