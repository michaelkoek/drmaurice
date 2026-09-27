"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useData } from "@/lib/data";
import { MAX_SUBJECTS } from "@/lib/types";
import { Btn, Field, Panel, inputCls, subjectColor, toast } from "./ui";

interface SubjectDraft { key: string; name: string; hint: string }
const newKey = () => Math.random().toString(36).slice(2);

function BackLink() {
  return <Link href="/" className="text-sm font-semibold text-muted hover:text-ink">← Dashboard</Link>;
}

function ExamFields({ name, setName, date, setDate, count, setCount }: { name: string; setName: (v: string) => void; date: string; setDate: (v: string) => void; count: string; setCount: (v: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
      <Field label="Naam van de toets"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bijv. Toets blok 1" maxLength={120} /></Field>
      <Field label="Toetsdatum"><input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Aantal vragen"><input className={inputCls} type="number" inputMode="numeric" min={1} value={count} onChange={(e) => setCount(e.target.value)} placeholder="Bijv. 160" /></Field>
    </div>
  );
}

export function NewExamForm() {
  const d = useData();
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [count, setCount] = useState("");
  const [subs, setSubs] = useState<SubjectDraft[]>([{ key: newKey(), name: "", hint: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = subs.map((s) => ({ name: s.name.trim(), hint: s.hint.trim() || null })).filter((s) => s.name);
    if (!name.trim()) return setError("Geef de toets een naam.");
    if (!clean.length) return setError("Voeg minstens één vak toe.");
    setBusy(true); setError(null);
    try {
      const ex = await d.createExam({ name: name.trim(), exam_date: date || null, question_count: count ? Number(count) : null, subjects: clean });
      toast("Toets aangemaakt");
      router.push(`/?examen=${ex.id}`);
    } catch { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mx-auto grid max-w-3xl gap-5" noValidate>
      <BackLink />
      <h1 className="font-display text-3xl font-bold">Nieuwe toets</h1>
      <Panel className="grid gap-5 p-5">
        <ExamFields {...{ name, setName, date, setDate, count, setCount }} />
        <div className="grid gap-2">
          <h2 className="font-semibold">Vakken</h2>
          <p className="text-[13px] text-muted">Elk vak wordt een eigen route naar de top. Een korte omschrijving helpt de AI om lessen bij het goede vak te zetten. Maximaal {MAX_SUBJECTS}.</p>
          {subs.map((s, i) => (
            <div key={s.key} className="grid items-start gap-2 sm:grid-cols-[auto_1fr_2fr_auto]">
              <span className="mt-3 hidden size-3 rounded-full sm:block" style={{ background: subjectColor(i) }} />
              <input aria-label={`Vak ${i + 1}`} className={inputCls} placeholder="Naam, bijv. Anatomie" value={s.name} maxLength={60} onChange={(e) => setSubs(subs.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)))} />
              <input aria-label={`Omschrijving vak ${i + 1}`} className={inputCls} placeholder="Omschrijving (optioneel), bijv. bouw van het lichaam, organen" value={s.hint} maxLength={200} onChange={(e) => setSubs(subs.map((x) => (x.key === s.key ? { ...x, hint: e.target.value } : x)))} />
              <Btn type="button" variant="ghost" disabled={subs.length === 1} onClick={() => setSubs(subs.filter((x) => x.key !== s.key))}>Verwijder</Btn>
            </div>
          ))}
          <Btn type="button" className="justify-self-start" disabled={subs.length >= MAX_SUBJECTS} onClick={() => setSubs([...subs, { key: newKey(), name: "", hint: "" }])}>+ Vak</Btn>
        </div>
        {error && <p className="text-[13px] text-eosin">{error}</p>}
        <div className="flex gap-2.5"><Btn variant="primary" type="submit" disabled={busy}>Toets aanmaken</Btn><Link href="/"><Btn type="button">Annuleren</Btn></Link></div>
      </Panel>
    </form>
  );
}

export function EditExam({ id }: { id: string }) {
  const d = useData();
  const router = useRouter();
  const exam = d.exams.find((e) => e.id === id);
  const subjects = d.subjects.filter((s) => s.exam_id === id).sort((a, b) => a.position - b.position);
  const [name, setName] = useState(exam?.name ?? "");
  const [date, setDate] = useState(exam?.exam_date ?? "");
  const [count, setCount] = useState(exam?.question_count ? String(exam.question_count) : "");
  const [newName, setNewName] = useState("");
  const [newHint, setNewHint] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!d.ready) return <p className="py-20 text-center text-muted">Laden…</p>;
  if (!exam) return <Panel className="p-6">Deze toets bestaat niet (meer). <Link className="underline" href="/">Naar dashboard</Link></Panel>;
  const lessonCount = (sid: string) => d.lessons.filter((l) => l.subject_id === sid).length;

  return (
    <div className="mx-auto grid max-w-3xl gap-5">
      <BackLink />
      <h1 className="font-display text-3xl font-bold">Toets &amp; vakken</h1>
      <Panel className="grid gap-4 p-5">
        <ExamFields {...{ name, setName, date, setDate, count, setCount }} />
        {msg && <p className="text-[13px] text-eosin">{msg}</p>}
        <Btn variant="primary" className="justify-self-start" onClick={async () => {
          if (!name.trim()) return setMsg("Geef de toets een naam.");
          setMsg(null);
          await d.updateExam(id, { name: name.trim(), exam_date: date || null, question_count: count ? Number(count) : null });
          toast("Opgeslagen");
        }}>Opslaan</Btn>
      </Panel>

      <Panel className="grid gap-3 p-5">
        <h2 className="font-semibold">Vakken</h2>
        {subjects.map((s) => <SubjectRow key={s.id} id={s.id} name={s.name} hint={s.hint ?? ""} color={s.color} lessons={lessonCount(s.id)} />)}
        {subjects.length < MAX_SUBJECTS ? (
          <div className="grid items-start gap-2 border-t border-dashed border-line pt-3 sm:grid-cols-[1fr_2fr_auto]">
            <input aria-label="Nieuw vak" className={inputCls} placeholder="Nieuw vak" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
            <input aria-label="Omschrijving nieuw vak" className={inputCls} placeholder="Omschrijving (optioneel)" value={newHint} maxLength={200} onChange={(e) => setNewHint(e.target.value)} />
            <Btn disabled={!newName.trim()} onClick={async () => { await d.addSubject(id, newName.trim(), newHint.trim() || null); setNewName(""); setNewHint(""); }}>Toevoegen</Btn>
          </div>
        ) : <p className="text-[13px] text-muted">Maximaal {MAX_SUBJECTS} vakken per toets.</p>}
      </Panel>

      <Panel className="grid justify-items-start gap-2 p-5">
        <h2 className="font-semibold">Toets verwijderen</h2>
        <p className="text-[13px] text-muted">Verwijdert ook alle lessen, eigen kaarten en voortgang van deze toets.</p>
        {confirmDel ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Weet je het zeker?</span>
            <Btn variant="danger" onClick={async () => { await d.deleteExam(id); toast("Toets verwijderd"); router.push("/"); }}>Verwijderen</Btn>
            <Btn onClick={() => setConfirmDel(false)}>Annuleren</Btn>
          </div>
        ) : <Btn variant="ghost" onClick={() => setConfirmDel(true)}>Toets verwijderen</Btn>}
      </Panel>
    </div>
  );
}

function SubjectRow({ id, name: n0, hint: h0, color, lessons }: { id: string; name: string; hint: string; color: number; lessons: number }) {
  const d = useData();
  const [name, setName] = useState(n0);
  const [hint, setHint] = useState(h0);
  const [note, setNote] = useState<string | null>(null);
  const dirty = name.trim() !== n0 || hint.trim() !== h0;
  return (
    <div className="grid gap-1">
      <div className="grid items-start gap-2 sm:grid-cols-[auto_1fr_2fr_auto_auto]">
        <span className="mt-3 hidden size-3 rounded-full sm:block" style={{ background: subjectColor(color) }} />
        <input aria-label="Naam vak" className={inputCls} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <input aria-label="Omschrijving vak" className={inputCls} value={hint} maxLength={200} placeholder="Omschrijving (optioneel)" onChange={(e) => setHint(e.target.value)} />
        <Btn disabled={!dirty || !name.trim()} onClick={async () => { await d.updateSubject(id, { name: name.trim(), hint: hint.trim() || null }); toast("Vak opgeslagen"); }}>Opslaan</Btn>
        <Btn variant="ghost" onClick={async () => { const ok = await d.deleteSubject(id); if (!ok) setNote(`Dit vak heeft ${lessons} ${lessons === 1 ? "les" : "lessen"}. Zet die eerst bij een ander vak.`); }}>Verwijder</Btn>
      </div>
      <span className="text-xs text-muted sm:pl-5">{lessons} {lessons === 1 ? "les" : "lessen"}</span>
      {note && <p className="text-[13px] text-eosin sm:pl-5">{note}</p>}
    </div>
  );
}
