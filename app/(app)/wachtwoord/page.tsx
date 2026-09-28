"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useData } from "@/lib/data";
import { passwordError, passwordRules } from "@/lib/password";
import { Btn, Field, Panel, PasswordChecklist, inputCls, toast } from "@/components/ui";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { email } = useData();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const weak = passwordError(pw, email ?? "");
    if (weak) return setError(weak);
    if (pw !== pw2) return setError("De wachtwoorden zijn niet gelijk.");
    setBusy(true); setError(null);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: pw, revokeOtherSessions: true });
    setBusy(false);
    if (error) {
      if (error.code === "WEAK_PASSWORD" || error.code === "PASSWORD_COMPROMISED") return setError(error.message ?? "Kies een sterker wachtwoord.");
      return setError(error.status === 400 ? "Je huidige wachtwoord klopt niet." : "Opslaan lukte niet. Probeer het opnieuw.");
    }
    toast("Wachtwoord opgeslagen");
    router.replace("/");
  }

  return (
    <main className="mx-auto grid max-w-sm gap-4 py-8">
      <h1 className="font-display text-2xl font-bold">Wachtwoord wijzigen</h1>
      <Panel className="p-5">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Huidig wachtwoord"><input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} /></Field>
          <Field label="Nieuw wachtwoord"><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} /></Field>
          <PasswordChecklist rules={passwordRules(pw, email ?? "")} />
          <Field label="Herhaal wachtwoord"><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} /></Field>
          {error && <p role="alert" className="text-[13px] text-eosin">{error}</p>}
          <Btn variant="primary" type="submit" disabled={busy}>Opslaan</Btn>
        </form>
      </Panel>
    </main>
  );
}
