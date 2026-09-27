"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useData, useExamView } from "@/lib/data";
import { dailyTarget, daysUntil } from "@/lib/stats";
import { METERS_PER_CARD } from "@/lib/types";
import { Mountain } from "./Mountain";
import { ScoreChart } from "./ScoreChart";
import { Btn, Panel, StatusChip, subjectColor } from "./ui";

const fmt = (n: number) => n.toLocaleString("nl-NL");
const LAST_EXAM = "dmc-exam";

export function Dashboard() {
  const d = useData();
  const router = useRouter();
  const params = useSearchParams();
  const examId = useMemo(() => {
    const wanted = params.get("examen") ?? (typeof window !== "undefined" ? safeGet(LAST_EXAM) : null);
    return d.exams.find((e) => e.id === wanted)?.id ?? d.exams[d.exams.length - 1]?.id ?? null;
  }, [params, d.exams]);
  useEffect(() => { if (examId) safeSet(LAST_EXAM, examId); }, [examId]);
  const { exam, subjects, lessons } = useExamView(examId);

  if (!d.ready) return <p className="py-20 text-center text-muted">Laden…</p>;
  if (d.error) return <Panel className="p-6"><p className="mb-3">{d.error}</p><Btn onClick={d.reload}>Opnieuw proberen</Btn></Panel>;
  if (!exam) {
    return (
      <Panel className="mx-auto mt-6 grid max-w-lg gap-3 p-8 text-center shadow-card">
        <h1 className="font-display text-2xl font-bold">Welkom bij DrMauriceCards</h1>
        <p className="text-muted">Begin met de toets waar je voor leert. Daarna voeg je per les de PowerPoint en de lesdoelen toe.</p>
        <Link href="/examen/nieuw" className="justify-self-center"><Btn variant="primary">Toets aanmaken</Btn></Link>
      </Panel>
    );
  }

  const tot = lessons.reduce((a, l) => a + l.total, 0), dn = lessons.reduce((a, l) => a + l.done, 0), left = tot - dn;
  const days = daysUntil(exam.exam_date);
  const perDay = dailyTarget(left, days);
  const lastStudied = [...lessons].sort((a, b) => (b.progress.last_studied_at ?? "").localeCompare(a.progress.last_studied_at ?? ""))[0];
  const bySubject = (id: string | null) => subjects.find((s) => s.id === id);

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-xs uppercase tracking-[0.08em] text-muted">
            {exam.question_count ? `${exam.question_count} vragen` : "Toets"}{exam.exam_date ? ` · ${new Date(exam.exam_date + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}` : ""}
          </div>
          <h1 className="font-display text-[clamp(26px,3.4vw,36px)] font-bold leading-tight text-balance">{exam.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.exams.length > 1 && (
            <select aria-label="Kies toets" value={exam.id} onChange={(e) => router.push(`/?examen=${e.target.value}`)} className="rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm">
              {d.exams.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          )}
          <Link href={`/examen/${exam.id}`}><Btn>Toets &amp; vakken</Btn></Link>
          <Link href="/examen/nieuw"><Btn variant="ghost">+ Nieuwe toets</Btn></Link>
          <Link href={`/examen/${exam.id}/les-toevoegen`}><Btn variant="primary" disabled={!subjects.length}>+ Les toevoegen</Btn></Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile k="Nog tot de top" v={<>{fmt(left * METERS_PER_CARD)} <small>m</small></>} s={left ? `${left} kaarten te gaan` : tot ? "Top bereikt" : "Nog geen kaarten"} />
        <Tile k="Kaarten beheerst" v={<>{dn} <small>/ {tot}</small></>} s={`${tot ? Math.round((dn / tot) * 100) : 0}% van alle kaarten`} />
        <Tile k="Dagetappe" v={perDay != null ? <>{perDay} <small>kaarten/dag</small></> : "–"} s={perDay != null ? `${perDay * METERS_PER_CARD} m per dag · nog ${days} dagen` : exam.exam_date ? "Toetsdatum is voorbij" : "Stel een toetsdatum in"} />
        <Tile k="Lessen" v={<>{lessons.length}</>} s={`${lessons.filter((l) => l.done > 0).length} begonnen · ${lessons.filter((l) => l.total && l.done >= l.total).length} af`} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.25fr_1fr]">
        <Panel className="overflow-hidden">
          <PanelHead title="De beklimming" sub="Elke graat is een vak, elk tentje een les" />
          {subjects.length
            ? <Mountain subjects={subjects} activeSubjectId={lastStudied?.lesson.subject_id ?? subjects[0]?.id ?? null}
                lessons={lessons.map((l) => ({ id: l.lesson.id, name: l.lesson.name, subjectId: l.lesson.subject_id, total: l.total, done: l.done, createdAt: l.lesson.created_at }))} />
            : <p className="px-[18px] pb-4 text-sm text-muted">Voeg eerst vakken toe bij <Link className="underline" href={`/examen/${exam.id}`}>Toets &amp; vakken</Link>.</p>}
        </Panel>
        <Panel>
          <PanelHead title="Waar sta je sterk?" sub="Goed bij de eerste poging, per les" />
          <ScoreChart subjects={subjects} rows={lessons.map((l) => ({ id: l.lesson.id, name: l.lesson.name, subject: bySubject(l.lesson.subject_id), score: l.score, done: l.done, total: l.total }))} />
        </Panel>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Flashcards per les</h2>
        {lessons.length > 0 && <span className="text-[13px] text-muted">Klik een les om te oefenen</span>}
      </div>
      {!lessons.length && (
        <Panel className="grid justify-items-start gap-2 p-5">
          <p>Nog geen lessen in deze toets.</p>
          <Link href={`/examen/${exam.id}/les-toevoegen`}><Btn variant="primary" disabled={!subjects.length}>Eerste les toevoegen</Btn></Link>
        </Panel>
      )}
      {[...subjects, ...(lessons.some((l) => !bySubject(l.lesson.subject_id)) ? [null] : [])].map((s) => {
        const ls = lessons.filter((l) => (s ? l.lesson.subject_id === s.id : !bySubject(l.lesson.subject_id)));
        if (!ls.length && !s) return null;
        return (
          <div key={s?.id ?? "none"} className="grid gap-2.5">
            <div className="flex items-center gap-2 font-semibold">
              <span className="size-[9px] rounded-full" style={{ background: s ? subjectColor(s.color) : "var(--faint)" }} />{s?.name ?? "Zonder vak"}
              <span className="text-[13px] font-normal text-muted">· {ls.length} {ls.length === 1 ? "les" : "lessen"}</span>
            </div>
            {ls.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2.5">
                {ls.map((l) => {
                  const pct = l.total ? Math.round((l.done / l.total) * 100) : 0;
                  return (
                    <Link key={l.lesson.id} href={`/les/${l.lesson.id}`} className="grid gap-2.5 rounded-[14px] border border-line bg-surface p-3.5 transition hover:-translate-y-px hover:border-accent">
                      <span className="text-[15px] font-semibold leading-snug">{l.lesson.name}</span>
                      <span className="h-1.5 overflow-hidden rounded bg-track"><i className="block h-full rounded" style={{ width: `${pct}%`, background: s ? subjectColor(s.color) : "var(--faint)" }} /></span>
                      <span className="flex items-center justify-between gap-2 text-xs tabular-nums text-muted">
                        <span>{l.done}/{l.total} kaarten{l.score != null ? ` · ${l.score}% eerste poging` : ""}</span>
                        <StatusChip score={l.score} long />{l.score == null && <span className="whitespace-nowrap font-semibold text-accent">Oefenen →</span>}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted">Nog geen lessen.</p>}
          </div>
        );
      })}
    </section>
  );
}

function Tile({ k, v, s }: { k: string; v: React.ReactNode; s: string }) {
  return (
    <Panel className="grid gap-0.5 px-4 py-3.5">
      <span className="text-xs text-muted">{k}</span>
      <span className="font-display text-[28px] font-bold leading-tight tabular-nums [&_small]:font-sans [&_small]:text-sm [&_small]:font-normal [&_small]:text-muted">{v}</span>
      <span className="text-xs text-muted">{s}</span>
    </Panel>
  );
}
function PanelHead({ title, sub }: { title: string; sub: string }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-2.5 px-[18px] pb-1.5 pt-4"><h2 className="font-display text-lg font-bold">{title}</h2><p className="text-[13px] text-muted">{sub}</p></div>;
}
function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
