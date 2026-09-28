"use client";
import { useEffect, useState } from "react";

export function Btn({ variant = "default", size = "md", className = "", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "good" | "again" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  const v = {
    default: "bg-surface text-ink border-line hover:border-accent",
    primary: "bg-ink text-bg border-ink hover:opacity-90",
    good: "bg-ok-soft text-ok border-transparent",
    again: "bg-eosin-soft text-eosin border-transparent",
    ghost: "bg-transparent text-muted border-transparent hover:text-ink",
    danger: "bg-eosin-soft text-eosin border-transparent",
  }[variant];
  const s = { sm: "px-2.5 py-1 text-[13px]", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3 text-[15px]" }[size];
  return <button {...p} className={`rounded-[10px] border font-semibold transition disabled:cursor-default disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${v} ${s} ${className}`} />;
}

export function Chip({ tone, children }: { tone: "ok" | "warn" | "extra" | "demo" | "own"; children: React.ReactNode }) {
  const t = { ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", extra: "bg-eosin-soft text-eosin", demo: "bg-track text-muted font-medium", own: "bg-accent-soft text-accent" }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>;
}

export function StatusChip({ score, long }: { score: number | null; long?: boolean }) {
  if (score == null) return null;
  if (score < 60) return <Chip tone="warn">▲ {long ? "Aandacht nodig" : "Aandacht"}</Chip>;
  if (score >= 85) return <Chip tone="ok">● Sterk</Chip>;
  return null;
}

export function Panel({ className = "", ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={`rounded-2xl border border-line bg-surface ${className}`} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1 text-[13px] text-muted">{label}{children}</label>;
}

export const inputCls = "w-full rounded-[10px] border border-line bg-bg px-3 py-2 text-[15px] text-ink focus:outline-2 focus:outline-offset-1 focus:outline-accent";

export const subjectColor = (i: number) => `var(--s${((i % 6) + 6) % 6})`;

/* one global toast */
let push: ((m: string) => void) | null = null;
export function toast(msg: string) { push?.(msg); }
export function Toaster() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    push = (m) => { setMsg(m); clearTimeout(t); t = setTimeout(() => setMsg(null), 3200); };
    return () => { push = null; clearTimeout(t); };
  }, []);
  return (
    <div role="status" aria-live="polite" className={`pointer-events-none fixed left-1/2 z-50 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-xl bg-ink px-4 py-2.5 text-center text-sm text-bg transition ${msg ? "opacity-100" : "translate-y-2 opacity-0"}`} style={{ bottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
      {msg}
    </div>
  );
}

/** Live password checklist; ✓/○ plus colour so it doesn't rely on colour alone. */
export function PasswordChecklist({ rules }: { rules: { id: string; label: string; ok: boolean }[] }) {
  return (
    <ul className="grid gap-0.5 text-[12px]" aria-label="Eisen aan het wachtwoord">
      {rules.map((r) => (
        <li key={r.id} className={r.ok ? "text-ok" : "text-muted"}>
          <span aria-hidden className="inline-block w-4">{r.ok ? "✓" : "○"}</span>{r.label}
          <span className="sr-only">{r.ok ? " (voldaan)" : " (nog niet voldaan)"}</span>
        </li>
      ))}
    </ul>
  );
}
