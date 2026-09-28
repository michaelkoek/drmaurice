"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { passwordError, passwordRules } from "@/lib/password";
import { Btn, Field, Panel, PasswordChecklist, inputCls } from "@/components/ui";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const mail = email.trim().toLowerCase();
    const weak = passwordError(pw, mail);
    if (weak) return setError(weak);
    if (pw !== pw2) return setError("De wachtwoorden zijn niet gelijk.");
    setBusy(true); setError(null);
    const { error } = await authClient.signUp.email({ name: name.trim() || mail.split("@")[0], email: mail, password: pw });
    setBusy(false);
    if (error) {
      if (error.code === "USER_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return setError("Er is al een account met dit e-mailadres. Log in.");
      if (error.code === "SIGNUP_NOT_ALLOWED") return setError("Dit e-mailadres heeft geen toegang. Vraag de beheerder om je toe te voegen.");
      if (error.code === "WEAK_PASSWORD" || error.code === "PASSWORD_COMPROMISED") return setError(error.message ?? "Kies een sterker wachtwoord.");
      if (error.status === 429) return setError("Te veel pogingen. Wacht even en probeer het opnieuw.");
      return setError("Account aanmaken lukte niet. Probeer het opnieuw.");
    }
    // Better Auth signs the new user in straight away
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <img src="/icon.svg" alt="" className="size-10" />
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight">Account aanmaken</h1>
          <p className="text-sm text-muted">DrMauriceCards</p>
        </div>
      </div>
      <Panel className="p-5 shadow-card">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Naam"><input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="E-mailadres"><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
          <Field label="Wachtwoord"><input id="password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} /></Field>
          <PasswordChecklist rules={passwordRules(pw, email.trim())} />
          <Field label="Herhaal wachtwoord"><input id="password2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} /></Field>
          {error && <p role="alert" className="text-[13px] text-eosin">{error}</p>}
          <Btn variant="primary" type="submit" disabled={busy}>{busy ? "Bezig…" : "Account aanmaken"}</Btn>
        </form>
      </Panel>
      <p className="mt-4 text-center text-[13px] text-muted">
        Al een account? <Link href="/login" className="font-semibold text-ink underline underline-offset-2">Inloggen</Link>
      </p>
    </main>
  );
}
