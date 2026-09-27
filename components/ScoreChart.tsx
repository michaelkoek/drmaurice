"use client";
import { useRef, useState } from "react";
import type { Subject } from "@/lib/types";
import { StatusChip, subjectColor } from "./ui";

export interface ScoreRow { id: string; name: string; subject: Subject | undefined; score: number | null; done: number; total: number }

/** Share of cards known on the first attempt, per lesson, best first. */
export function ScoreChart({ rows, subjects }: { rows: ScoreRow[]; subjects: Subject[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; r: ScoreRow } | null>(null);
  const sorted = [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  if (!rows.length) return <p className="px-[18px] pb-4 text-sm text-muted">Nog geen lessen. Voeg een les toe om je scores te zien.</p>;
  return (
    <>
      <div ref={box} className="relative grid gap-[7px] px-[18px] pb-4 pt-2">
        {sorted.map((r) => (
          <div key={r.id} className="grid grid-cols-[minmax(100px,150px)_1fr_auto] items-center gap-2.5 text-[13px]"
            onMouseMove={(e) => { const b = box.current!.getBoundingClientRect(); setTip({ x: e.clientX - b.left, y: e.clientY - b.top - 6, r }); }}
            onMouseLeave={() => setTip(null)}>
            <span className="flex min-w-0 items-center gap-1.5"><span className="size-[9px] flex-none rounded-full" style={{ background: subjectColor(r.subject?.color ?? 0) }} /><span className="truncate">{r.name}</span></span>
            <span className="relative h-3.5 border-l border-line">
              {r.score != null && <span className="absolute left-0 top-0 h-3.5 rounded-r" style={{ width: `${r.score}%`, background: subjectColor(r.subject?.color ?? 0) }} />}
            </span>
            <span className={`flex min-w-[88px] items-center justify-end gap-1.5 font-mono text-xs tabular-nums ${r.score == null ? "text-faint" : ""}`}>
              <StatusChip score={r.score} />{r.score == null ? "nog niet" : `${r.score}%`}
            </span>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(100px,150px)_1fr_auto] gap-2.5 font-mono text-[11px] text-faint">
          <span /><span className="flex justify-between"><span>0%</span><span>50%</span><span>100%</span></span><span className="min-w-[88px]" />
        </div>
        {tip && (
          <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs text-bg" style={{ left: tip.x, top: tip.y }}>
            {tip.r.name} · {tip.r.subject?.name ?? "Geen vak"}<br />
            {tip.r.score == null ? "Nog niet geoefend" : `${tip.r.score}% goed bij eerste poging`} · {tip.r.done}/{tip.r.total} beheerst
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 px-[18px] pb-3.5 text-xs text-muted">
        {subjects.map((s) => <span key={s.id} className="flex items-center gap-1.5"><span className="size-[9px] rounded-full" style={{ background: subjectColor(s.color) }} />{s.name}</span>)}
      </div>
    </>
  );
}
