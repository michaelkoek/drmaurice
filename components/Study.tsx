"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "@/lib/data";
import { clean } from "@/lib/sanitize";
import { METERS_PER_CARD, type Card } from "@/lib/types";
import { Btn, Chip, Field, Panel, inputCls, subjectColor, toast } from "./ui";

type FormCtx = { mode: "add" } | { mode: "edit"; card: Card } | { mode: "fill"; card: Card };

export function Study({ lessonId }: { lessonId: string }) {
  const d = useData();
  const router = useRouter();
  const lesson = d.lessons.find((l) => l.id === lessonId);
  const subject = d.subjects.find((s) => s.id === lesson?.subject_id);
  const cards = useMemo(() => (lesson ? d.cardsFor(lesson) : []), [lesson, d]);
  const progress = d.progressFor(lessonId);

  const [active, setActive] = useState<Set<number> | null>(null);
  const [showExtra, setShowExtra] = useState(false);
  const [deck, setDeck] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [form, setForm] = useState<FormCtx | null>(null);
  const [gains, setGains] = useState<{ id: number; at: number }[]>([]);
  const built = useRef(false);

  const goals = lesson?.goals ?? [];
  const activeSet = active ?? new Set(goals.map((g) => g.id));
  const inScope = useCallback((c: Card) => (c.g === 0 ? showExtra || !goals.length : !goals.length || activeSet.has(c.g)), [showExtra, goals.length, activeSet]);
  const scope = cards.filter(inScope);
  const mastered = new Set(progress.mastered);

  const rebuild = useCallback(() => {
    setDeck(cards.filter(inScope).filter((c) => !new Set(d.progressFor(lessonId).mastered).has(c.id)).map((c) => c.id));
    setIdx(0); setFlipped(false);
  }, [cards, inScope, d, lessonId]);

  // build the deck once data is loaded, and again whenever the scope or the card set changes
  const scopeKey = `${[...activeSet].sort().join(",")}|${showExtra}|${cards.map((c) => c.id).join(",")}`;
  useEffect(() => { if (lesson) { rebuild(); built.current = true; } }, [scopeKey, !!lesson]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = cards.find((c) => c.id === deck[idx]);
  const flip = useCallback(() => setFlipped((f) => !f), []);
  const next = useCallback(() => { setIdx((i) => i + 1); setFlipped(false); }, []);

  const good = useCallback(() => {
    if (!current) return;
    const fresh = !mastered.has(current.id);
    d.answer(lessonId, current.id, true);
    if (fresh) setGains((g) => [...g, { id: Date.now(), at: scope.length ? ((scope.filter((c) => mastered.has(c.id)).length + 1) / scope.length) * 100 : 0 }]);
    if (idx + 1 >= deck.length) toast(`Basiskamp ${lesson?.name} bereikt`);
    next();
  }, [current, mastered, d, lessonId, scope, idx, deck.length, lesson?.name, next]);
  const again = useCallback(() => {
    if (!current) return;
    d.answer(lessonId, current.id, false);
    setDeck((dk) => [...dk, current.id]);
    next();
  }, [current, d, lessonId, next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT", "SUMMARY"].includes(t.tagName)) return;
      const inControls = !!t.closest?.("#controls");
      if (t.tagName === "BUTTON" && !inControls) return;
      if (inControls && e.code === "Enter") return;
      if (e.code === "Space") { e.preventDefault(); flip(); }
      else if (e.key === "ArrowRight" && idx < deck.length) next();
      else if (e.key === "ArrowLeft" && idx > 0) { setIdx((i) => i - 1); setFlipped(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, next, idx, deck.length]);

  useEffect(() => { if (!gains.length) return; const t = setTimeout(() => setGains((g) => g.slice(1)), 1400); return () => clearTimeout(t); }, [gains]);

  if (!d.ready) return <p className="py-20 text-center text-muted">Laden…</p>;
  if (!lesson) return <Panel className="p-6">Deze les bestaat niet (meer). <Link className="underline" href="/">Naar dashboard</Link></Panel>;

  const color = subjectColor(subject?.color ?? 0);
  const doneInScope = scope.filter((c) => mastered.has(c.id)).length;
  const pct = scope.length ? (doneInScope / scope.length) * 100 : 0;
  const left = scope.length - doneInScope;
  const goal = current ? goals.find((g) => g.id === current.g) : undefined;
  const label = current && current.g && goal ? `LD${current.g} · ${goal.t}` : "Buiten de lesdoelen";
  const own = d.own.filter((o) => o.lesson_id === lessonId);
  const hasExtra = cards.some((c) => c.g === 0) && goals.length > 0;

  return (
    <section className="mx-auto grid max-w-[820px] gap-[18px]">
      <div className="grid gap-3.5">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <Link href={`/?examen=${lesson.exam_id}`} className="text-sm font-semibold text-muted hover:text-ink">← Dashboard</Link>
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted">
            <span className="size-[9px] flex-none rounded-full" style={{ background: color }} />
            <b className="text-[15px] font-semibold text-ink">{lesson.name}</b><span>· {subject?.name ?? "Zonder vak"}</span>
          </span>
          <Btn onClick={() => setForm({ mode: "add" })}>+ Kaart toevoegen</Btn>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
          <div className="relative mr-3.5 h-1.5 rounded bg-track" aria-hidden>
            <i className="absolute inset-y-0 left-0 rounded transition-[width] duration-700" style={{ width: `${pct}%`, background: color }} />
            <span className="absolute top-1/2 -ml-[7px] -mt-[7px] size-3.5 rounded-full transition-[left] duration-700" style={{ left: `${pct}%`, background: color, boxShadow: "0 0 0 3px var(--surface)" }} />
            <span className="absolute -right-3 -top-[15px] h-4 w-3 border-l-[1.5px] border-muted"><span className="absolute left-0 top-0 border-y-[3.5px] border-l-[9px] border-y-transparent" style={{ borderLeftColor: color }} /></span>
            {gains.map((g) => <span key={g.id} className="gain absolute -top-6 whitespace-nowrap font-mono text-xs" style={{ left: `calc(${g.at}% - 14px)` }}>+{METERS_PER_CARD} m</span>)}
          </div>
          <span className="whitespace-nowrap text-[13px] tabular-nums text-muted">{left ? <><b className="font-semibold text-ink">{(left * METERS_PER_CARD).toLocaleString("nl-NL")} m</b> tot basiskamp</> : <b className="font-semibold text-ink">Basiskamp bereikt</b>}</span>
        </div>
      </div>

      {form && <OwnCardForm key={form.mode + ("card" in form ? form.card.id : "")} ctx={form} lessonId={lessonId} goals={goals} onClose={() => setForm(null)} />}

      {current ? (
        <>
          <div className="flip-card cursor-pointer rounded-[20px]" data-flipped={flipped} onClick={flip} role="button" tabIndex={0} aria-label="Kaart omdraaien" id="card">
            <div className="flip-inner min-h-[380px]">
              <Face>
                <Meta label={label} x={!current.g}>{current.own && <Chip tone="own">Eigen kaart</Chip>}</Meta>
                <div className="my-auto font-display text-[clamp(22px,3vw,30px)] font-medium leading-snug text-balance">{current.q}</div>
                <div className="text-xs text-muted">Tik of druk op spatie voor het antwoord</div>
              </Face>
              <Face back>
                <Meta label={label} x={!current.g}>{current.own && <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setForm({ mode: "edit", card: current }); }}>Bewerken</Btn>}</Meta>
                {current.a && <div className="rich my-auto text-lg leading-relaxed" dangerouslySetInnerHTML={{ __html: clean(current.a) }} />}
                {current.gap && (
                  <div className="rounded-lg bg-eosin-soft px-2.5 py-2 text-[13px] text-eosin">
                    {current.gap}
                    <div className="mt-2"><Btn size="sm" onClick={(e) => { e.stopPropagation(); setForm({ mode: "fill", card: current }); }}>Vul het antwoord zelf in</Btn></div>
                  </div>
                )}
                {current.note && <div className="rich rounded-lg bg-warn-soft px-2.5 py-2 text-[13px] text-warn"><b>Let op:</b> <span dangerouslySetInnerHTML={{ __html: clean(current.note) }} /></div>}
                <div className="border-t border-dashed border-line pt-2.5 font-mono text-xs text-muted">Bron: {current.ref || "–"}</div>
              </Face>
            </div>
          </div>
          <div id="controls" className="grid grid-cols-2 items-center gap-2.5 sm:grid-cols-[auto_auto_1fr_auto_auto]">
            <Btn aria-label="Vorige kaart" disabled={idx === 0} onClick={() => { setIdx((i) => i - 1); setFlipped(false); }}>←</Btn>
            <Btn onClick={flip}>Omdraaien</Btn>
            <span className="hidden sm:block" />
            <Btn variant="again" size="lg" onClick={again}>Opnieuw</Btn>
            <Btn variant="good" size="lg" onClick={good}>Wist ik</Btn>
          </div>
          <p className="text-center text-xs text-faint">Spatie draait om · ← → bladeren</p>
        </>
      ) : (
        <Summary lessonName={lesson.name} scope={scope} goals={goals.filter((g) => activeSet.has(g.id))} cards={cards} firstTry={progress.first_try}
          onDash={() => router.push(`/?examen=${lesson.exam_id}`)} onRedo={() => { d.resetProgress(lessonId); setTimeout(rebuild, 0); }} />
      )}

      {goals.length > 0 && (
        <Drawer title="Lesdoelen" meta={`${[...activeSet].length} van ${goals.length} actief`}>
          {goals.map((g) => (
            <button key={g.id} aria-pressed={activeSet.has(g.id)}
              onClick={() => { const n = new Set(activeSet); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); if (!n.size) n.add(g.id); setActive(n); }}
              className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-2.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-left text-sm leading-snug hover:border-hema aria-pressed:border-hema aria-pressed:bg-hema-soft">
              <span className="pt-px font-mono text-xs text-hema">LD{g.id}</span>
              <span>{g.t}<br /><span className="mt-1 inline-block">{g.cov === "full" ? <Chip tone="ok">Gedekt in presentatie</Chip> : g.cov === "none" ? <Chip tone="warn">Niet in presentatie</Chip> : <Chip tone="warn">Deels in presentatie</Chip>}</span></span>
              <span className="font-mono text-xs text-muted">{cards.filter((c) => c.g === g.id).length}</span>
            </button>
          ))}
          {hasExtra && <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={showExtra} onChange={(e) => setShowExtra(e.target.checked)} /> Ook stof buiten de lesdoelen tonen</label>}
        </Drawer>
      )}

      <Drawer title="Bronnotities" meta={`${lesson.findings.gaps.length} ${lesson.findings.gaps.length === 1 ? "gat" : "gaten"}, ${lesson.findings.conflicts.length} ${lesson.findings.conflicts.length === 1 ? "tegenstrijdigheid" : "tegenstrijdigheden"}`}>
        <h3 className="text-sm font-semibold">Ontbreekt in de presentatie</h3>
        {lesson.findings.gaps.length ? <ol className="grid list-decimal gap-1.5 pl-5 text-sm">{lesson.findings.gaps.map((x, i) => <li key={i} className="rich" dangerouslySetInnerHTML={{ __html: clean(x) }} />)}</ol> : <p className="text-sm text-muted">Niets gevonden.</p>}
        <h3 className="text-sm font-semibold">Tegenstrijdig in de bron</h3>
        {lesson.findings.conflicts.length ? <ol className="grid list-decimal gap-1.5 pl-5 text-sm">{lesson.findings.conflicts.map((x, i) => <li key={i} className="rich" dangerouslySetInnerHTML={{ __html: clean(x) }} />)}</ol> : <p className="text-sm text-muted">Niets gevonden.</p>}
      </Drawer>

      <Drawer title="Mijn kaarten" meta={String(own.length)}>
        {own.length ? own.map((o) => {
          const card = cards.find((c) => c.id === o.id)!;
          return (
            <div key={o.id} className="grid gap-1 rounded-[10px] border border-line px-3 py-2.5 text-sm">
              <span className="font-semibold">{o.question}</span>
              <span className="rich text-muted" dangerouslySetInnerHTML={{ __html: clean(o.answer_html) }} />
              <span className="font-mono text-[11.5px] text-faint">{o.goal ? `LD${o.goal}` : "buiten lesdoelen"} · {o.source}{o.replaces ? " · vervangt een AI-kaart" : ""}</span>
              <span><Btn variant="ghost" size="sm" onClick={() => setForm({ mode: "edit", card })}>Bewerken</Btn></span>
            </div>
          );
        }) : <p className="text-sm text-muted">Nog geen eigen kaarten. Gebruik &quot;+ Kaart toevoegen&quot; voor stof die ontbreekt.</p>}
      </Drawer>

      <LessonSettings lessonId={lessonId} />
    </section>
  );
}

function Face({ back, children }: { back?: boolean; children: React.ReactNode }) {
  return <div className={`flip-face ${back ? "flip-back" : ""} flex flex-col gap-4 overflow-auto rounded-[20px] border border-line bg-surface px-5 py-6 shadow-card sm:px-8 sm:py-7`}>{children}</div>;
}
function Meta({ label, x, children }: { label: string; x: boolean; children?: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-2.5 font-mono text-xs"><span className={x ? "text-eosin" : "text-hema"}>{label}</span>{children}</div>;
}
function Drawer({ title, meta, children }: { title: string; meta: string; children: React.ReactNode }) {
  return (
    <details className="rounded-[14px] border border-line bg-surface px-4 py-0.5">
      <summary className="cursor-pointer py-3 text-sm font-semibold">{title} <span className="font-normal text-muted">· {meta}</span></summary>
      <div className="grid gap-2 pb-3.5">{children}</div>
    </details>
  );
}

function Summary({ lessonName, scope, goals, cards, firstTry, onDash, onRedo }: {
  lessonName: string; scope: Card[]; goals: { id: number; t: string }[]; cards: Card[]; firstTry: Record<string, boolean>; onDash: () => void; onRedo: () => void;
}) {
  const tried = scope.filter((c) => c.id in firstTry);
  const score = tried.length ? Math.round((tried.filter((c) => firstTry[c.id]).length / tried.length) * 100) : null;
  const byGoal = goals.map((g) => {
    const cs = cards.filter((c) => c.g === g.id && c.id in firstTry);
    return { g, s: cs.length ? Math.round((cs.filter((c) => firstTry[c.id]).length / cs.length) * 100) : null };
  });
  return (
    <Panel className="grid gap-3.5 px-5 py-7 sm:px-8">
      <div className="font-mono text-xs uppercase tracking-[0.08em] text-muted">Basiskamp bereikt</div>
      <div className="font-display text-[28px] font-bold leading-tight">{lessonName} is af: {scope.length} kaarten, {(scope.length * METERS_PER_CARD).toLocaleString("nl-NL")} hoogtemeters</div>
      <p className="text-muted">Goed bij de eerste poging: <b className="text-ink">{score == null ? "–" : `${score}%`}</b>{byGoal.length ? ". Per lesdoel:" : ""}</p>
      {byGoal.length > 0 && (
        <div className="grid gap-1.5">
          {byGoal.map(({ g, s }) => (
            <div key={g.id} className="grid grid-cols-[44px_1fr_90px] items-center gap-2.5 text-[13px]">
              <span className="text-muted">LD{g.id}</span>
              <span className="h-2.5 overflow-hidden rounded bg-track"><i className="block h-full rounded-r bg-accent" style={{ width: `${s ?? 0}%` }} /></span>
              <span className="text-right font-mono text-xs tabular-nums">{s == null ? "–" : `${s}%`}{s != null && s < 60 ? " ▲" : ""}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2.5"><Btn variant="primary" onClick={onDash}>Naar dashboard</Btn><Btn onClick={onRedo}>Opnieuw oefenen</Btn></div>
    </Panel>
  );
}

function OwnCardForm({ ctx, lessonId, goals, onClose }: { ctx: FormCtx; lessonId: string; goals: { id: number; t: string }[]; onClose: () => void }) {
  const d = useData();
  const src = ctx.mode === "add" ? null : ctx.card;
  const [q, setQ] = useState(src?.q ?? "");
  const [a, setA] = useState(ctx.mode === "edit" ? ctx.card.raw ?? "" : "");
  const [g, setG] = useState(String(src ? src.g : goals[0]?.id ?? 0));
  const [ref, setRef] = useState(ctx.mode === "edit" && ctx.card.ref !== "Eigen kaart" ? ctx.card.ref : "");
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => { box.current?.scrollIntoView({ block: "start", behavior: "smooth" }); (ctx.mode === "fill" ? box.current?.querySelector<HTMLTextAreaElement>("#cf-a") : box.current?.querySelector<HTMLTextAreaElement>("#cf-q"))?.focus(); }, [ctx.mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return setError("Vul een vraag in.");
    if (!a.trim()) return setError("Vul een antwoord in.");
    setBusy(true);
    try {
      await d.saveOwnCard({ id: ctx.mode === "edit" ? ctx.card.id : undefined, lessonId, goal: goals.length ? Number(g) : 0, question: q.trim(), answer: a.trim(), source: ref.trim(), replaces: ctx.mode === "fill" ? ctx.card.id : null });
      toast(ctx.mode === "edit" ? "Kaart bijgewerkt" : ctx.mode === "fill" ? "Antwoord toegevoegd" : "Kaart toegevoegd");
      onClose();
    } catch { setBusy(false); }
  }

  return (
    <form ref={box} onSubmit={submit} noValidate className="grid gap-3 rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-display text-lg font-bold">{ctx.mode === "edit" ? "Eigen kaart bewerken" : ctx.mode === "fill" ? "Antwoord zelf invullen" : "Eigen kaart toevoegen"}</h2>
      <p className="text-[13px] text-muted">{ctx.mode === "fill" ? "Dit stond niet in de presentatie. Vul het antwoord in uit de reader of je aantekeningen; jouw kaart vervangt deze." : "Voor stof die de AI heeft gemist, of die je uit de reader of je aantekeningen haalt."}</p>
      <Field label="Vraag"><textarea id="cf-q" rows={2} className={inputCls} value={q} maxLength={1000} onChange={(e) => { setQ(e.target.value); setError(null); }} /></Field>
      <Field label="Antwoord"><textarea id="cf-a" rows={4} className={inputCls} value={a} maxLength={5000} placeholder="Begin een regel met - voor een opsomming" onChange={(e) => { setA(e.target.value); setError(null); }} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {goals.length > 0 && (
          <Field label="Lesdoel">
            <select id="cf-g" className={inputCls} value={g} onChange={(e) => setG(e.target.value)}>
              {goals.map((x) => <option key={x.id} value={x.id}>LD{x.id} · {x.t.length > 70 ? x.t.slice(0, 70) + "…" : x.t}</option>)}
              <option value="0">Buiten de lesdoelen</option>
            </select>
          </Field>
        )}
        <Field label="Bron (optioneel)"><input id="cf-r" className={inputCls} value={ref} maxLength={200} placeholder="Bijv. Reader p. 14" onChange={(e) => setRef(e.target.value)} /></Field>
      </div>
      {error && <p className="text-[13px] text-eosin" role="alert">{error}</p>}
      <div className="flex flex-wrap items-center gap-2.5">
        <Btn variant="primary" type="submit" disabled={busy}>Opslaan</Btn>
        <Btn type="button" onClick={onClose}>Annuleren</Btn>
        <span className="flex-1" />
        {ctx.mode === "edit" && (
          <Btn type="button" variant="ghost" onClick={async () => {
            if (!sure) return setSure(true);
            await d.deleteOwnCard(ctx.card.id); toast("Kaart verwijderd"); onClose();
          }}>{sure ? "Zeker weten? Klik nogmaals" : "Kaart verwijderen"}</Btn>
        )}
      </div>
    </form>
  );
}

function LessonSettings({ lessonId }: { lessonId: string }) {
  const d = useData();
  const router = useRouter();
  const lesson = d.lessons.find((l) => l.id === lessonId)!;
  const subjects = d.subjects.filter((s) => s.exam_id === lesson.exam_id).sort((a, b) => a.position - b.position);
  const [name, setName] = useState(lesson.name);
  const [sub, setSub] = useState(lesson.subject_id ?? "");
  const [sure, setSure] = useState(false);
  const dirty = name.trim() !== lesson.name || sub !== (lesson.subject_id ?? "");
  return (
    <Drawer title="Les bewerken" meta={lesson.source?.pptx ?? "naam, vak, verwijderen"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Naam"><input className={inputCls} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Vak"><select className={inputCls} value={sub} onChange={(e) => setSub(e.target.value)}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Btn disabled={!dirty || !name.trim()} onClick={async () => { await d.updateLesson(lessonId, { name: name.trim(), subject_id: sub || null }); toast("Les opgeslagen"); }}>Opslaan</Btn>
        <span className="flex-1" />
        {sure ? (
          <span className="flex flex-wrap items-center gap-2 text-sm">Les en voortgang verwijderen?
            <Btn variant="danger" onClick={async () => { const ex = lesson.exam_id; await d.deleteLesson(lessonId); toast("Les verwijderd"); router.push(`/?examen=${ex}`); }}>Verwijderen</Btn>
            <Btn onClick={() => setSure(false)}>Annuleren</Btn>
          </span>
        ) : <Btn variant="ghost" onClick={() => setSure(true)}>Les verwijderen</Btn>}
      </div>
    </Drawer>
  );
}
