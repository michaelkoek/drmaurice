"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Subject } from "@/lib/types";
import { METERS_PER_CARD } from "@/lib/types";
import { subjectColor } from "./ui";

export interface RidgeLesson { id: string; name: string; subjectId: string | null; total: number; done: number; createdAt: string }

const SUMMIT = { x: 400, y: 42 };
function ridgePath(i: number, n: number) {
  const x0 = n === 1 ? 120 : 40 + (720 * i) / (n - 1);
  const dx = SUMMIT.x - x0;
  return `M${x0.toFixed(1)} 400 C ${(x0 + dx * 0.35).toFixed(1)} 300, ${(SUMMIT.x - dx * 0.25).toFixed(1)} 150, ${SUMMIT.x} ${SUMMIT.y}`;
}

/* deterministic scenery */
function scenery() {
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const stars = Array.from({ length: 60 }, () => ({ x: rnd() * 800, y: rnd() * 200, r: rnd() * 1.2 + 0.3, o: 0.4 + rnd() * 0.6 }));
  const trees: { x: number; y: number; h: number; o: number }[] = [];
  for (let i = 0; i < 400 && trees.length < 85; i++) {
    const x = rnd() * 800, y = 320 + rnd() * 80, h = 9 + rnd() * 9, o = 0.75 + rnd() * 0.25;
    // inside the mountain body: approximate its outline
    const edge = x < 400 ? 360 - (x / 400) * 320 : 360 - ((800 - x) / 400) * 320;
    if (y - 6 > edge + 30) trees.push({ x, y, h, o });
  }
  return { stars, trees: trees.sort((a, b) => a.y - b.y) };
}

export function Mountain({ subjects, lessons, activeSubjectId }: { subjects: Subject[]; lessons: RidgeLesson[]; activeSubjectId: string | null }) {
  const { stars, trees } = useMemo(scenery, []);
  const refs = useRef<(SVGPathElement | null)[]>([]);
  const [lens, setLens] = useState<number[]>([]);
  useEffect(() => { setLens(refs.current.map((p) => p?.getTotalLength() ?? 0)); }, [subjects.length]);

  const ridges = subjects.map((s, i) => {
    const ls = lessons.filter((l) => l.subjectId === s.id)
      .sort((a, b) => Number(b.total > 0 && b.done >= b.total) - Number(a.total > 0 && a.done >= a.total) || a.createdAt.localeCompare(b.createdAt));
    const tot = ls.reduce((a, l) => a + l.total, 0), dn = ls.reduce((a, l) => a + l.done, 0);
    return { s, i, d: ridgePath(i, subjects.length), ls, tot, dn };
  });
  const point = (i: number, frac: number) => refs.current[i]?.getPointAtLength((lens[i] ?? 0) * frac) ?? { x: SUMMIT.x, y: SUMMIT.y };
  const act = ridges.find((r) => r.s.id === activeSubjectId) ?? ridges[0];
  const allDone = lessons.length > 0 && lessons.every((l) => l.total > 0 && l.done >= l.total);

  return (
    <div>
      <svg viewBox="0 0 800 400" className="block h-auto w-full" role="img" aria-label={`Berg met ${subjects.length} routes naar de toets`}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style={{ stopColor: "var(--sky-top)" }} /><stop offset="1" style={{ stopColor: "var(--sky-bot)" }} /></linearGradient>
          <linearGradient id="zones" x1="0" y1="42" x2="0" y2="400" gradientUnits="userSpaceOnUse">
            {[["0", "--snow"], [".17", "--snow"], [".24", "--rock"], [".44", "--rock"], [".52", "--meadow"], [".68", "--meadow"], [".78", "--forest"], ["1", "--forest"]].map(([o, c]) => <stop key={o + c} offset={o} style={{ stopColor: `var(${c})` }} />)}
          </linearGradient>
          <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0"><stop offset=".5" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".16" /></linearGradient>
        </defs>
        <rect width="800" height="400" fill="url(#sky)" />
        <g style={{ opacity: "var(--star)" }}>{stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />)}</g>
        <circle cx="690" cy="70" r="22" style={{ fill: "var(--sun)" }} opacity=".9" />
        <path d="M0 310 L90 230 L160 270 L240 200 L300 250 L360 220 L420 260 L520 190 L600 240 L680 180 L760 230 L800 210 L800 400 L0 400Z" style={{ fill: "var(--far2)" }} />
        <path d="M0 340 L120 270 L200 300 L280 260 L360 300 L470 260 L560 300 L660 250 L800 310 L800 400 L0 400Z" style={{ fill: "var(--far)" }} />
        <path d="M-10 400 L-10 360 C 110 310, 240 170, 355 78 C 372 64, 386 50, 400 40 C 414 50, 428 64, 445 78 C 560 170, 690 310, 810 360 L810 400Z" fill="url(#zones)" />
        <path d="M400 40 C 414 50, 428 64, 445 78 C 560 170, 690 310, 810 360 L810 400 L400 400Z" fill="url(#shade)" />
        <path d="M352 81 C 372 64, 386 50, 400 40 C 414 50, 428 64, 448 81 L436 92 L424 83 L412 98 L400 86 L388 100 L376 84 L364 93Z" style={{ fill: "var(--snow)" }} />
        {trees.map((t, i) => <path key={i} d={`M${t.x} ${t.y - t.h} L${t.x + t.h * 0.38} ${t.y} L${t.x - t.h * 0.38} ${t.y}Z`} style={{ fill: "var(--tree)" }} opacity={t.o} />)}
        {ridges.map((r) => {
          const len = lens[r.i] ?? 0;
          let cum = 0;
          return (
            <g key={r.s.id}>
              <path ref={(el) => { refs.current[r.i] = el; }} d={r.d} fill="none" stroke="var(--trail)" strokeWidth={2.2} strokeDasharray="2 6" strokeLinecap="round" opacity={r.ls.length ? 1 : 0.4} />
              <path d={r.d} fill="none" style={{ stroke: subjectColor(r.s.color) }} strokeWidth={4.5} strokeLinecap="round" strokeDasharray={`${len * (r.tot ? r.dn / r.tot : 0)} ${len || 1}`} />
              {len > 0 && r.ls.map((l, k) => {
                cum += l.total;
                if (k === r.ls.length - 1 && r.ls.length > 1) return null; // the last camp is the summit
                const p = point(r.i, (r.tot ? cum / r.tot : 0) * 0.985);
                const done = l.total > 0 && l.done >= l.total;
                return (
                  <g key={l.id} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`}>
                    <title>{`${l.name}: ${l.done}/${l.total} kaarten`}</title>
                    <path d="M-6 0 L0 -9 L6 0Z" fill={done ? "#fff" : "rgba(255,255,255,.55)"} stroke="#2a2f38" strokeWidth={1} />
                    {done && <><line x1={0} y1={-9} x2={0} y2={-21} stroke="#2a2f38" strokeWidth={1.2} /><path d="M0 -21 L10 -18 L0 -15Z" style={{ fill: subjectColor(r.s.color) }} /></>}
                  </g>
                );
              })}
            </g>
          );
        })}
        <g className="cloud" opacity=".9"><ellipse cx="0" cy="210" rx="70" ry="15" style={{ fill: "var(--cloud)" }} /><ellipse cx="-30" cy="202" rx="36" ry="13" style={{ fill: "var(--cloud)" }} /><ellipse cx="34" cy="201" rx="30" ry="11" style={{ fill: "var(--cloud)" }} /></g>
        <g className="cloud c2" opacity=".8"><ellipse cx="0" cy="158" rx="52" ry="12" style={{ fill: "var(--cloud)" }} /><ellipse cx="22" cy="151" rx="28" ry="10" style={{ fill: "var(--cloud)" }} /></g>
        <line x1="400" y1="40" x2="400" y2="12" style={{ stroke: "var(--pole)" }} strokeWidth="2" />
        <path d="M400 12 L426 18 L400 25Z" style={{ fill: "var(--eosin)" }} opacity={allDone ? 1 : 0.35} />
        {act && lens[act.i] > 0 && (() => {
          const p = point(act.i, act.tot ? act.dn / act.tot : 0);
          return (
            <g transform={`translate(${p.x} ${p.y})`}>
              <ellipse cx="0" cy="1" rx="7" ry="2" fill="#000" opacity=".2" />
              <rect x="-4.5" y="-14" width="6" height="8" rx="2" fill="#7a4b2a" />
              <path d="M-1 -2 L-3 -8 L3 -8 L2 -2Z" fill="#23304a" />
              <rect x="-2.5" y="-15" width="6" height="8" rx="3" style={{ fill: subjectColor(act.s.color) }} />
              <circle cx="0.5" cy="-18.5" r="3.4" fill="#f1c9a5" />
              <path d="M-3 -20 Q0.5 -24.5 4 -20Z" fill="#2a2f38" />
            </g>
          );
        })()}
      </svg>
      <div className="grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
        {ridges.map((r) => (
          <div key={r.s.id} className="grid gap-px px-3.5 py-2.5 text-[13px]">
            <span className="flex items-center gap-1.5 font-semibold"><span className="size-2.5 flex-none rounded-full" style={{ background: subjectColor(r.s.color) }} />{r.s.name}</span>
            <span className="font-mono text-[11.5px] tabular-nums text-muted">{r.ls.length ? `${(r.dn * METERS_PER_CARD).toLocaleString("nl-NL")} / ${(r.tot * METERS_PER_CARD).toLocaleString("nl-NL")} m` : "nog geen lessen"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
