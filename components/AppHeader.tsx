"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useData } from "@/lib/data";

export function AppHeader() {
  const { email, admin, signOut } = useData();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const links = [
    ...(admin ? [{ href: "/beheer", label: "Beheer" }] : []),
    { href: "/feedback", label: "Feedback" },
    { href: "/instellingen", label: "Instellingen" },
  ];

  return (
    <header className="mb-5 flex items-center justify-between gap-3 py-2">
      <Link href="/" className="flex min-w-0 items-center gap-2 font-display text-lg font-bold">
        <img src="/icon.svg" alt="" className="size-7 shrink-0" /> <span className="truncate">DrMauriceCards</span>
      </Link>

      <nav className="hidden items-center gap-3 text-[13px] text-muted sm:flex">
        <span>{email}</span>
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg px-2 py-1 font-semibold hover:text-ink">{l.label}</Link>
        ))}
        <button onClick={signOut} className="rounded-lg px-2 py-1 font-semibold hover:text-ink">Uitloggen</button>
      </nav>

      <div ref={menu} className="relative sm:hidden">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Menu"
          className="grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        {open && (
          <div role="menu" className="absolute right-0 top-12 z-50 grid w-56 gap-0.5 rounded-xl border border-line bg-surface p-1.5 text-sm shadow-card">
            {email && <div className="truncate px-3 py-2 text-[13px] text-faint">{email}</div>}
            {links.map((l) => (
              <Link key={l.href} href={l.href} role="menuitem" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 font-semibold hover:bg-track">
                {l.label}
              </Link>
            ))}
            <div className="my-1 border-t border-line" />
            <button role="menuitem" onClick={() => { setOpen(false); signOut(); }} className="rounded-lg px-3 py-2.5 text-left font-semibold hover:bg-track">
              Uitloggen
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
