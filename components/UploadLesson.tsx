"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useData, useExamView } from "@/lib/data";
import { GenError, generateLesson, type StepKey, type StepState } from "@/lib/generate";
import { DECK_EXT, parseDeck, parseGoals, type ParsedDeck, type ParsedGoals } from "@/lib/parse";
import { clean } from "@/lib/sanitize";
import type { Draft } from "@/lib/types";
import { Btn, Chip, Field, Panel, inputCls, toast } from "./ui";

const STEPS: [StepKey, string][] = [["read", "Bestanden gelezen"], ["pick", "Afbeeldingen met leerstof kiezen"], ["write", "Flashcards schrijven"], ["check", "Controleren"]];
// no presentation: the AI researches the learning goals on trusted medical sites
const WEB_STEPS: [StepKey, string][] = [["read", "Lesdoelen gelezen"], ["write", "Bronnen zoeken en flashcards schrijven"], ["check", "Controleren"]];

type SlotState<T> = { status: "empty" } | { status: "reading"; name: string } | { status: "ready"; name: string; data: T } | { status: "error"; message: string };

export function UploadLesson({ examId }: { examId: string }) {
  const d = useData();
  const router = useRouter();
  const { exam, subjects } = useExamView(examId);
  const [deck, setDeck] = useState<SlotState<ParsedDeck>>({ status: "empty" });
  const [goals, setGoals] = useState<SlotState<ParsedGoals>>({ status: "empty" });
  const [typed, setTyped] = useState("");
  const [steps, setSteps] = useState<Partial<Record<StepKey, { state: StepState; sub?: string }>> | null>(null);
  const [stepList, setStepList] = useState(STEPS);
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const ctl = useRef<AbortController | null>(null);

  if (!d.ready) return <p className="py-20 text-center text-muted">Laden…</p>;
  if (!exam) return <Panel className="p-6">Deze toets bestaat niet. <Link className="underline" href="/">Naar dashboard</Link></Panel>;

  async function takeDeck(file: File) {
    if (!DECK_EXT.test(file.name)) return setDeck({ status: "error", message: `${file.name} wordt niet ondersteund. Gebruik een PowerPoint (.pptx) of pdf.` });
    setDeck({ status: "reading", name: file.name });
    try {
      const data = await parseDeck(file);
      if (!data.slides.length) throw new Error("empty");
      setDeck({ status: "ready", name: file.name, data });
    } catch { setDeck({ status: "error", message: "Dit bestand kon niet gelezen worden. Controleer of het een PowerPoint (.pptx) of een pdf zonder wachtwoord is." }); }
  }
  async function takeGoals(file: File) {
    if (!/\.(pages|docx|txt|md)$/i.test(file.name)) return setGoals({ status: "error", message: `${file.name} wordt niet ondersteund. Gebruik .pages, .docx of .txt.` });
    setGoals({ status: "reading", name: file.name });
    try { setGoals({ status: "ready", name: file.name, data: await parseGoals(file) }); }
    catch { setGoals({ status: "error", message: "Dit bestand kon niet gelezen worden. Op een iPhone helpt het vaak om het als .docx te exporteren." }); }
  }
  function route(files: File[]) { for (const f of files) (DECK_EXT.test(f.name) ? takeDeck : takeGoals)(f); }

  const deckReady = deck.status === "ready";
  const goalsInput: ParsedGoals | null = goals.status === "ready" ? goals.data : typed.trim() ? { text: typed, preview: null } : null;
  const hasGoals = !!goalsInput && (!!goalsInput.text.trim() || !!goalsInput.preview);

  async function generate() {
    if (!deckReady && !hasGoals) return;
    setDraft(null); setRunning(true);
    const list = deckReady ? STEPS : WEB_STEPS;
    setStepList(list);
    setSteps(Object.fromEntries(list.map(([k]) => [k, { state: "idle" }])));
    const onStep = (k: StepKey, state: StepState, sub?: string) => setSteps((s) => ({ ...s!, [k]: { state, sub } }));
    ctl.current = new AbortController();
    try {
      const out = await generateLesson({
        deck: deckReady ? deck.data : null, deckName: deckReady ? deck.name : null,
        goals: hasGoals ? goalsInput : null, goalsName: goals.status === "ready" ? goals.name : null,
        subjects, signal: ctl.current.signal, onStep,
      });
      setDraft(out);
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      const msg = aborted ? "Gestopt." : e instanceof GenError ? e.message : "Er ging iets mis. Probeer het opnieuw.";
      setSteps((s) => {
        const next = { ...s! };
        const k = (Object.keys(next) as StepKey[]).find((x) => next[x]?.state === "on") ?? "write";
        next[k] = { state: "fail", sub: msg };
        return next;
      });
    } finally { setRunning(false); ctl.current = null; }
  }

  async function save(go: boolean) {
    if (!draft) return;
    const l = await d.createLesson(examId, draft);
    toast(`${l.name} opgeslagen`);
    router.push(go ? `/les/${l.id}` : `/?examen=${examId}`);
  }

  return (
    <section className="mx-auto grid max-w-[900px] gap-[18px]">
      <Link href={`/?examen=${examId}`} className="text-sm font-semibold text-muted hover:text-ink">← Dashboard</Link>
      <div>
        <h1 className="font-display text-3xl font-bold">Nieuwe les toevoegen</h1>
        <p className="max-w-[66ch] text-muted">Upload de PowerPoint of pdf van de les en het document met lesdoelen; één van de twee is ook genoeg. De AI maakt er flashcards van, legt de nadruk op de lesdoelen en zet de les bij het juiste vak. Heb je alleen lesdoelen, dan zoekt de AI de stof op betrouwbare medische websites. Je controleert alles voordat je opslaat.</p>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Slot id="pptx" badge={deck.status === "ready" && deck.data.kind === "pdf" ? "PDF" : "PPTX"} badgeColor="#c8553d" title="Presentatie van de les" hint="Sleep het .pptx- of .pdf-bestand hierheen of tik om te kiezen." accept=".pptx,.pdf,application/pdf"
          state={deck} onFiles={(fs) => (fs.length > 1 ? route(fs) : takeDeck(fs[0]))} onClear={() => setDeck({ status: "empty" })}
          summary={(p) => {
            const pdf = p.kind === "pdf";
            const words = p.slides.reduce((a, s) => a + s.text.join(" ").split(/\s+/).filter(Boolean).length, 0);
            const imgs = new Set(p.slides.flatMap((s) => s.images.map((i) => i.path))).size;
            return {
              stat: <><b>{p.slides.length}</b> {pdf ? "pagina's" : "slides"} · <b>{words.toLocaleString("nl-NL")}</b> woorden · <b>{imgs}</b> {pdf ? "met afbeeldingen" : "afbeeldingen"}</>,
              preview: p.slides.slice(0, 4).map((s) => `${pdf ? "Pagina" : "Slide"} ${s.n}: ${s.text.filter((t) => !/^\d+$/.test(t)).join(" · ")}`).join("\n") + "…",
            };
          }} />
        <Slot id="goals" badge="DOEL" badgeColor="#2f6fb0" title="Lesdoelen" hint="Sleep het .pages-, .docx- of .txt-bestand hierheen of tik om te kiezen. Zonder lesdoelen weegt alle stof even zwaar." accept=".pages,.docx,.txt,.md"
          state={goals} onFiles={(fs) => (fs.length > 1 ? route(fs) : takeGoals(fs[0]))} onClear={() => setGoals({ status: "empty" })}
          summary={(g) => ({
            stat: g.text.trim() ? <><b>{g.text.split("\n").filter((l) => l.trim()).length}</b> regels tekst gelezen</> : g.preview ? "Geen tekst gevonden; de voorvertoning van het document wordt meegestuurd" : "Geen tekst gevonden",
            preview: g.text.trim().slice(0, 900),
          })}>
          {goals.status !== "ready" && goals.status !== "reading" && (
            <label className="relative z-10 grid gap-1.5 text-[13px] text-muted">
              Of typ of plak de lesdoelen
              <textarea id="goals-typed" rows={4} className={inputCls} value={typed} maxLength={8000} placeholder={"1. Je kunt de bouw van het hart beschrijven\n2. …"} onChange={(e) => setTyped(e.target.value)} />
            </label>
          )}
        </Slot>
      </div>

      <div className="flex flex-wrap items-center gap-3.5">
        <Btn variant="primary" disabled={(!deckReady && !hasGoals) || running} onClick={generate}>Maak flashcards</Btn>
        <span className="text-[13px] text-muted">{
          !deckReady && !hasGoals ? "Kies een presentatie, lesdoelen of allebei."
          : !deckReady ? "Geen presentatie: de AI zoekt de stof op betrouwbare medische websites en noemt per kaart de bron. Dit duurt meestal 2 tot 4 minuten."
          : !hasGoals ? "Klaar om te maken. Tip: voeg de lesdoelen toe voor betere kaarten."
          : "Klaar. Dit duurt meestal 1 tot 3 minuten."}</span>
      </div>

      {steps && (
        <Panel>
          <ol className="grid gap-2.5 px-[18px] py-4">
            {stepList.map(([k, label]) => {
              const s = steps[k] ?? { state: "idle" as const };
              const dot = { idle: "border-line", on: "border-accent border-t-transparent spin", ok: "border-ok bg-ok", fail: "border-eosin bg-eosin" }[s.state];
              return (
                <li key={k} className={`grid grid-cols-[22px_1fr] items-start gap-2.5 text-sm ${s.state === "idle" ? "text-faint" : "text-ink"}`}>
                  <span className={`mt-0.5 size-[18px] rounded-full border-2 ${dot}`} />
                  <span>{label}{s.sub && <small className="block text-[12.5px] text-muted">{s.sub}</small>}</span>
                </li>
              );
            })}
          </ol>
          {running && <div className="px-[18px] pb-4"><Btn onClick={() => ctl.current?.abort()}>Stoppen</Btn></div>}
        </Panel>
      )}

      {draft && <Review draft={draft} setDraft={setDraft} subjects={subjects} onSave={save} onDiscard={() => { setDraft(null); setSteps(null); }} />}
    </section>
  );
}

function Slot<T>({ id, badge, badgeColor, title, hint, accept, state, onFiles, onClear, summary, children }: {
  id: string; badge: string; badgeColor: string; title: string; hint: string; accept: string;
  state: SlotState<T>; onFiles: (f: File[]) => void; onClear: () => void; summary: (d: T) => { stat: React.ReactNode; preview: string };
  children?: React.ReactNode;
}) {
  const [drag, setDrag] = useState(false);
  const filled = state.status === "ready" || state.status === "reading";
  return (
    <div
      className={`relative grid min-h-[190px] content-start gap-2.5 rounded-2xl border-[1.5px] bg-surface p-5 transition ${filled ? "border-solid border-line" : "border-dashed border-line"} ${drag ? "border-accent bg-accent-soft" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const fs = Array.from(e.dataTransfer.files); if (fs.length) onFiles(fs); }}
    >
      <span className="grid size-10 place-items-center rounded-[10px] font-mono text-[11px] font-semibold text-white" style={{ background: badgeColor }}>{badge}</span>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {state.status === "empty" && <p className="text-[13px] text-muted">{hint}</p>}
      {state.status === "error" && <p className="text-[13px] text-eosin">{state.message}</p>}
      {state.status === "reading" && <><div className="break-all text-sm font-semibold">{state.name}</div><div className="text-[13px] text-muted">Bezig met lezen…</div></>}
      {state.status === "ready" && (() => {
        const s = summary(state.data);
        return (
          <>
            <div className="flex items-center justify-between gap-2.5 break-all text-sm font-semibold"><span>{state.name}</span><Btn variant="ghost" size="sm" className="relative z-10" onClick={onClear}>Wijzig</Btn></div>
            <div className="text-[13px] text-muted [&_b]:font-semibold [&_b]:text-ink">{s.stat}</div>
            {s.preview && <pre className="max-h-[150px] overflow-auto whitespace-pre-wrap rounded-lg bg-bg px-2.5 py-2 font-sans text-[12.5px] leading-normal text-muted">{s.preview}</pre>}
          </>
        );
      })()}
      {!filled && <input id={`file-${id}`} type="file" accept={accept} aria-label={title} className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) onFiles(fs); e.target.value = ""; }} />}
      {children}
    </div>
  );
}

function Review({ draft, setDraft, subjects, onSave, onDiscard }: { draft: Draft; setDraft: (d: Draft) => void; subjects: { id: string; name: string }[]; onSave: (go: boolean) => void; onDiscard: () => void }) {
  const [busy, setBusy] = useState(false);
  const byG = (g: number) => draft.cards.filter((c) => c.g === g).length;
  const chosen = subjects.find((s) => s.id === draft.subjectId);
  const web = !!draft.source.web;
  return (
    <Panel className="grid gap-4 p-5">
      <h2 className="font-display text-lg font-bold">Controleer en sla op</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Naam van de les"><input id="draft-name" className={inputCls} value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Vak">
          <select id="draft-subject" className={inputCls} value={draft.subjectId ?? ""} onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })}>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      {draft.why && chosen && <p className="text-[13px] text-muted">De AI koos {chosen.name}: {draft.why}</p>}
      {draft.goals.length ? (
        <div className="grid gap-1.5">
          <h3 className="mb-1 text-sm font-semibold">Kaarten per lesdoel</h3>
          {draft.goals.map((g) => (
            <div key={g.id} className="grid grid-cols-[40px_1fr_auto] items-start gap-2 text-sm">
              <span className="pt-0.5 font-mono text-xs text-hema">LD{g.id}</span>
              <span>{g.t} {g.cov === "full" ? <Chip tone="ok">Gedekt</Chip> : g.cov === "none" ? <Chip tone="warn">{web ? "Geen bron gevonden" : "Niet in presentatie"}</Chip> : <Chip tone="warn">Deels</Chip>}</span>
              <span className="whitespace-nowrap font-mono text-xs text-muted">{byG(g.id)} kaarten</span>
            </div>
          ))}
          {byG(0) > 0 && <div className="grid grid-cols-[40px_1fr_auto] gap-2 text-sm"><span className="font-mono text-xs text-hema">—</span><span>Buiten de lesdoelen <Chip tone="extra">Lage prioriteit</Chip></span><span className="font-mono text-xs text-muted">{byG(0)} kaarten</span></div>}
        </div>
      ) : <p className="text-[13px] text-muted">Geen lesdoelen gebruikt: {draft.cards.length} kaarten over de hele presentatie.</p>}
      {web && <p className="text-[13px] text-muted">Deze kaarten komen van betrouwbare medische websites, niet uit een presentatie. Elke kaart noemt de bron; controleer twijfelgevallen via de link.</p>}
      {(draft.findings.gaps.length > 0 || draft.findings.conflicts.length > 0) && (
        <div className="grid gap-2 text-sm">
          {draft.findings.gaps.length > 0 && <><h3 className="font-semibold">{web ? "Niet gevonden in bronnen" : "Ontbreekt in de presentatie"}</h3><ol className="grid list-decimal gap-1 pl-5">{draft.findings.gaps.map((x, i) => <li key={i} className="rich" dangerouslySetInnerHTML={{ __html: clean(x) }} />)}</ol></>}
          {draft.findings.conflicts.length > 0 && <><h3 className="font-semibold">Tegenstrijdig in de bron</h3><ol className="grid list-decimal gap-1 pl-5">{draft.findings.conflicts.map((x, i) => <li key={i} className="rich" dangerouslySetInnerHTML={{ __html: clean(x) }} />)}</ol></>}
        </div>
      )}
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Alle {draft.cards.length} kaarten bekijken</summary>
        <div className="mt-2.5 grid max-h-[360px] gap-2 overflow-auto pr-1">
          {draft.cards.map((c) => (
            <div key={c.id} className="grid gap-1 rounded-[10px] border border-line px-3 py-2.5 text-sm">
              <span className="font-semibold">{c.q}</span>
              <span className="rich text-muted" dangerouslySetInnerHTML={{ __html: c.a ? clean(c.a) : (web ? "<i>Geen betrouwbare bron gevonden</i>" : "<i>Niet in de presentatie</i>") }} />
              <span className="font-mono text-[11.5px] text-faint">{c.g ? `LD${c.g}` : "buiten lesdoelen"} · {c.ref}</span>
            </div>
          ))}
        </div>
      </details>
      <div className="flex flex-wrap gap-2.5">
        <Btn variant="primary" disabled={busy || !draft.name.trim()} onClick={async () => { setBusy(true); try { await onSave(true); } catch { setBusy(false); } }}>Opslaan en oefenen</Btn>
        <Btn disabled={busy || !draft.name.trim()} onClick={async () => { setBusy(true); try { await onSave(false); } catch { setBusy(false); } }}>Opslaan</Btn>
        <Btn variant="ghost" onClick={onDiscard}>Weggooien</Btn>
      </div>
    </Panel>
  );
}
