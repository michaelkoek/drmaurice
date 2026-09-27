"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Btn, Field, Panel, inputCls, toast } from "@/components/ui";

export default function SetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError("Kies minstens 8 tekens.");
    if (pw !== pw2) return setError("De wachtwoorden zijn niet gelijk.");
    setBusy(true); setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError("Opslaan lukte niet. Vraag een nieuwe link aan.");
    toast("Wachtwoord opgeslagen");
    router.replace("/");
  }

  return (
    <main className="mx-auto grid max-w-sm gap-4 py-8">
      <h1 className="font-display text-2xl font-bold">Kies een wachtwoord</h1>
      <Panel className="p-5">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Nieuw wachtwoord"><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} /></Field>
          <Field label="Herhaal wachtwoord"><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} /></Field>
          {error && <p className="text-[13px] text-eosin">{error}</p>}
          <Btn variant="primary" type="submit" disabled={busy}>Opslaan</Btn>
        </form>
      </Panel>
    </main>
  );
}
