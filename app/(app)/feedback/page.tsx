"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FEEDBACK_KINDS, FEEDBACK_MAX, parseFeedback, type FeedbackKind } from "@/lib/feedback";
import { Btn, Field, Panel, inputCls, toast } from "@/components/ui";

export default function FeedbackPage() {
  const router = useRouter();
  const [kind, setKind] = useState<FeedbackKind>("idee");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseFeedback({ kind, message });
    if ("error" in parsed) return setError(parsed.error);
    setBusy(true); setError(null);
    const res = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const json = (await res?.json().catch(() => null)) as { message?: string } | null;
      return setError(json?.message ?? "Versturen lukte niet. Controleer je verbinding.");
    }
    toast("Bedankt voor je feedback!");
    router.replace("/");
  }

  return (
    <main className="mx-auto grid max-w-lg gap-4 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Feedback</h1>
        <p className="text-[14px] text-muted">Mis je iets of werkt er iets niet? Laat het weten, dan kijken we of het erin kan.</p>
      </div>
      <Panel className="p-5">
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Soort">
            <select value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)} className={inputCls}>
              {FEEDBACK_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="Je feedback">
            <textarea rows={7} maxLength={FEEDBACK_MAX} value={message} onChange={(e) => setMessage(e.target.value)} className={inputCls}
              placeholder="Bijvoorbeeld: ik zou graag kaarten willen exporteren naar Anki." />
          </Field>
          {error && <p role="alert" className="text-[13px] text-eosin">{error}</p>}
          <Btn variant="primary" type="submit" disabled={busy}>{busy ? "Bezig…" : "Versturen"}</Btn>
        </form>
      </Panel>
    </main>
  );
}
