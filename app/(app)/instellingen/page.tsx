"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useData } from "@/lib/data";
import { currentPushSubscription, disablePush, enablePush, isIOS, pushSupport, testPush, useInstall, useOnline, type PushSupport } from "@/lib/pwa";
import { Btn, Panel, toast } from "@/components/ui";

export default function SettingsPage() {
  const { email, lessons, cachedAt } = useData();
  return (
    <main className="mx-auto grid max-w-lg gap-4 py-4">
      <h1 className="font-display text-2xl font-bold">Instellingen</h1>
      <InstallSection />
      <NotificationSection />
      <Panel className="grid gap-2 p-5">
        <h2 className="font-display text-lg font-bold">Offline oefenen</h2>
        <p className="text-[14px] text-muted">
          Je lessen ({lessons.length}) worden op dit apparaat bewaard. Zonder internet kun je ze gewoon oefenen; je voortgang wordt opgeslagen zodra je weer online bent.
          Lessen toevoegen en kaarten maken lukt alleen met internet.
        </p>
        {cachedAt && <p className="text-[13px] text-warn">Je ziet nu de bewaarde kopie, omdat de server niet bereikbaar is.</p>}
        <p className="text-[13px] text-faint">Bij uitloggen wordt alles van dit apparaat gewist.</p>
      </Panel>
      <Panel className="flex items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Account</h2>
          <p className="text-[14px] text-muted">{email}</p>
        </div>
        <Link href="/wachtwoord" className="rounded-lg px-2 py-1 text-[14px] font-semibold text-accent hover:underline">Wachtwoord wijzigen</Link>
      </Panel>
    </main>
  );
}

function InstallSection() {
  const { standalone, prompt } = useInstall();
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(isIOS()), []);

  return (
    <Panel className="grid gap-3 p-5">
      <h2 className="font-display text-lg font-bold">App installeren</h2>
      {standalone ? (
        <p className="text-[14px] text-ok">✓ Je gebruikt DrMauriceCards als app.</p>
      ) : prompt ? (
        <>
          <p className="text-[14px] text-muted">Installeer DrMauriceCards als app: een eigen icoon, volledig scherm en offline oefenen.</p>
          <Btn variant="primary" onClick={async () => { if (await prompt()) toast("Geïnstalleerd"); }} className="justify-self-start">Installeer app</Btn>
        </>
      ) : ios ? (
        <ol className="grid list-decimal gap-1 pl-5 text-[14px] text-muted">
          <li>Open deze site in <b className="text-ink">Safari</b>.</li>
          <li>Tik op <b className="text-ink">Deel</b> <span aria-hidden>(vierkantje met pijl omhoog)</span>.</li>
          <li>Kies <b className="text-ink">Zet op beginscherm</b> en tik op <b className="text-ink">Voeg toe</b>.</li>
          <li>Open de app voortaan via het icoon op je beginscherm.</li>
        </ol>
      ) : (
        <p className="text-[14px] text-muted">
          Kies in het menu van je browser <b className="text-ink">Installeren</b> of <b className="text-ink">Toevoegen aan startscherm</b>, of klik op het installeer-icoon in de adresbalk.
        </p>
      )}
    </Panel>
  );
}

function NotificationSection() {
  const online = useOnline();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSupport(pushSupport());
    currentPushSubscription().then((s) => setOn(!!s)).catch(() => {});
  }, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); toast(done); }
    catch (e) { toast((e as Error).message || "Er ging iets mis."); }
    finally { setBusy(false); setSupport(pushSupport()); setOn(!!(await currentPushSubscription().catch(() => null))); }
  }

  return (
    <Panel className="grid gap-3 p-5">
      <h2 className="font-display text-lg font-bold">Herinneringen</h2>
      <p className="text-[14px] text-muted">
        Eén melding per dag rond etenstijd, alleen als er binnen 30 dagen een toets is en je die dag nog niet hebt geoefend. Met hoeveel kaarten je nog te gaan hebt.
      </p>
      {support === "ios-install" && (
        <p className="text-[14px] text-warn">Op iPhone en iPad werken meldingen alleen in de geïnstalleerde app (iOS 16.4 of nieuwer). Zet de app eerst op je beginscherm (zie hierboven) en open hem daar.</p>
      )}
      {support === "denied" && (
        <p className="text-[14px] text-warn">Meldingen zijn geblokkeerd voor deze site. Sta ze toe in de instellingen van je browser of telefoon en kom hier terug.</p>
      )}
      {support === "unsupported" && <p className="text-[14px] text-muted">Deze browser ondersteunt geen meldingen.</p>}
      {support === "ok" && (
        <div className="flex flex-wrap items-center gap-2">
          {on ? (
            <>
              <span className="mr-1 text-[14px] text-ok">✓ Aan op dit apparaat</span>
              <Btn size="sm" disabled={busy || !online} onClick={() => run(testPush, "Testmelding verstuurd")}>Stuur testmelding</Btn>
              <Btn size="sm" variant="ghost" disabled={busy || !online} onClick={() => run(disablePush, "Herinneringen uit")}>Zet uit</Btn>
            </>
          ) : (
            <Btn variant="primary" disabled={busy || !online} onClick={() => run(enablePush, "Herinneringen aan")}>Zet herinneringen aan</Btn>
          )}
          {!online && <span className="text-[13px] text-faint">Hiervoor heb je internet nodig.</span>}
        </div>
      )}
    </Panel>
  );
}
