"use client";
import Link from "next/link";
import { useData } from "@/lib/data";

export function AppHeader() {
  const { email, signOut } = useData();
  return (
    <header className="mb-5 flex items-center justify-between gap-3 py-2">
      <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold">
        <img src="/icon.svg" alt="" className="size-7" /> DrMauriceCards
      </Link>
      <div className="flex items-center gap-3 text-[13px] text-muted">
        <span className="hidden sm:inline">{email}</span>
        <button onClick={signOut} className="rounded-lg px-2 py-1 font-semibold hover:text-ink">Uitloggen</button>
      </div>
    </header>
  );
}
