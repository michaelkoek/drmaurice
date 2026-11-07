"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { isIOS, registerServiceWorker, useInstall, useOnline, warmOffline } from "@/lib/pwa";

/** Registers the service worker and keeps every exam and lesson page available offline. */
export function PwaClient() {
  const { ready, cachedAt, exams, lessons } = useData();
  const online = useOnline();
  useEffect(() => { registerServiceWorker(); }, []);

  const ids = [...exams.map((e) => e.id), ...lessons.map((l) => l.id)].join();
  useEffect(() => {
    if (!ready || cachedAt || !online) return;
    const pages = ["/", ...exams.map((e) => `/examen/${e.id}`), ...lessons.map((l) => `/les/${l.id}`), "/instellingen"];
    // after the page has settled; the worker only fetches pages it does not have yet
    const t = setTimeout(() => warmOffline(pages), 2500);
    return () => clearTimeout(t);
    // re-run only when the set of pages changes (ids), not on every data change
  }, [ready, cachedAt, online, ids]);
  return null;
}

const when = (iso: string) => new Date(iso).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Says when the app works from the copy on this device, and when offline progress is still waiting. */
export function ConnectionBanner() {
  const { cachedAt, pendingSync } = useData();
  const online = useOnline();
  if (online && !cachedAt && !pendingSync) return null;

  const waiting = pendingSync ? ` Voortgang van ${pendingSync} ${pendingSync === 1 ? "les" : "lessen"} wordt opgeslagen zodra je weer online bent.` : "";
  const text = !online
    ? `Je bent offline. Je oefent met de kaarten op dit apparaat${cachedAt ? ` (bijgewerkt ${when(cachedAt)})` : ""}.${waiting}`
    : cachedAt
      ? `De server is niet bereikbaar. Je ziet je gegevens van ${when(cachedAt)}.${waiting}`
      : `Voortgang van ${pendingSync} ${pendingSync === 1 ? "les" : "lessen"} wordt opgeslagen…`;

  return (
    <div role="status" className="mb-4 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[13px] text-ink">
      <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${online ? "bg-warn" : "bg-faint"}`} />
      <p>{text}</p>
    </div>
  );
}

const HINT_KEY = "dmc-install-hint-dismissed";

/** One quiet nudge on phones to put the app on the home screen (needed on iOS for reminders). */
export function InstallHint() {
  const { standalone, prompt } = useInstall();
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(HINT_KEY) === "1"; } catch {}
    setShow(!dismissed && window.matchMedia("(pointer: coarse)").matches);
  }, []);
  if (!show || standalone || (!prompt && !isIOS())) return null;

  const dismiss = () => { setShow(false); try { localStorage.setItem(HINT_KEY, "1"); } catch {} };
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[13px] shadow-card">
      <img src="/icon-192.png" alt="" className="size-9 rounded-lg" />
      <p className="flex-1 text-muted">
        <span className="font-semibold text-ink">Zet DrMauriceCards op je beginscherm.</span> Dan oefen je ook offline en krijg je herinneringen voor je toets.
      </p>
      {prompt
        ? <button onClick={async () => { if (await prompt()) dismiss(); }} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-bg">Installeer</button>
        : <Link href="/instellingen" className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-bg">Hoe?</Link>}
      <button onClick={dismiss} aria-label="Niet meer tonen" className="rounded-lg px-1.5 py-1 text-faint hover:text-ink">✕</button>
    </div>
  );
}
