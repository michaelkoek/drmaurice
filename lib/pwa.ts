"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { clearOffline } from "./offline";

/** Browser side of the PWA: service worker, install prompt, push subscription. The worker itself is public/sw.js. */

const swSupported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;

export function registerServiceWorker() {
  // not in `next dev`: a caching worker there only gets in the way
  if (!swSupported() || process.env.NODE_ENV !== "production") return;
  navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((e) => console.warn("[sw]", e));
}

async function activeWorker() {
  if (!swSupported() || process.env.NODE_ENV !== "production") return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg?.active ?? null;
}

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i); return (h >>> 0).toString(36); };

/** Asks the worker to keep these pages (and the build files they need) for offline use. */
export async function warmOffline(pages: string[]) {
  if (!swSupported() || process.env.NODE_ENV !== "production") return;
  // on the very first visit the worker is still installing; wait for it
  const sw = (await navigator.serviceWorker.ready).active;
  if (!sw) return;
  const assets = performance.getEntriesByType("resource").map((e) => new URL(e.name).pathname).filter((p) => p.startsWith("/_next/static/"));
  // the build files this page loads identify the deployment
  const build = hash([...document.querySelectorAll<HTMLScriptElement>("script[src*='/_next/static/']")].map((s) => new URL(s.src).pathname).sort().join());
  sw.postMessage({ type: "warm", pages, assets, build });
}

// ── Display mode & install ──────────────────────────────────────────────────────

export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);
export const isIOS = () =>
  typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
let installEvent: InstallEvent | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  // Chrome/Edge/Android fire this once the app is installable; keep it for our own button
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e as InstallEvent; installListeners.forEach((f) => f()); });
  window.addEventListener("appinstalled", () => { installEvent = null; installListeners.forEach((f) => f()); });
}

/** `prompt` is null when the browser offers no install dialog (Safari, Firefox, already installed). */
export function useInstall() {
  const canPrompt = useSyncExternalStore(
    (f) => { installListeners.add(f); return () => installListeners.delete(f); },
    () => !!installEvent,
    () => false,
  );
  const [standalone, setStandalone] = useState(false);
  useEffect(() => setStandalone(isStandalone()), []);
  return {
    standalone,
    prompt: canPrompt
      ? async () => {
          const e = installEvent;
          if (!e) return false;
          await e.prompt();
          const { outcome } = await e.userChoice;
          installEvent = null;
          installListeners.forEach((f) => f());
          return outcome === "accepted";
        }
      : null,
  };
}

// ── Connectivity ──────────────────────────────────────────────────────────────

export function useOnline() {
  return useSyncExternalStore(
    (f) => { addEventListener("online", f); addEventListener("offline", f); return () => { removeEventListener("online", f); removeEventListener("offline", f); }; },
    () => navigator.onLine,
    () => true,
  );
}

// ── Push ──────────────────────────────────────────────────────────────────────

/** ok · ios-install (iOS only allows push for apps on the home screen) · denied · unsupported */
export type PushSupport = "ok" | "ios-install" | "denied" | "unsupported";

export function pushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (isIOS() && !isStandalone()) return "ios-install";
  // no worker in `next dev` (it would cache unhashed dev files); try push with `npm run build && npm start`
  if (process.env.NODE_ENV !== "production") return "unsupported";
  if (!swSupported() || !("PushManager" in window) || !("Notification" in window) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

async function registration() {
  if (!swSupported() || process.env.NODE_ENV !== "production") return null;
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
}

export async function currentPushSubscription() {
  const reg = await registration().catch(() => null);
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function pushApi(body: Record<string, unknown>) {
  const res = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? "Er ging iets mis.");
}

function base64UrlToBytes(b64: string) {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Asks permission (must run from a click) and registers this device for the daily reminder. */
export async function enablePush() {
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Je hebt meldingen niet toegestaan. Zet ze aan in de instellingen van je browser of telefoon.");
  if (!(await registration())) throw new Error("Meldingen werken niet in deze browser.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) }));
  await pushApi({ op: "subscribe", subscription: sub.toJSON() });
  return sub;
}

export async function disablePush() {
  const sub = await currentPushSubscription();
  if (!sub) return;
  await pushApi({ op: "unsubscribe", endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export async function testPush() {
  const sub = await currentPushSubscription();
  if (!sub) throw new Error("Meldingen staan niet aan op dit apparaat.");
  await pushApi({ op: "test", endpoint: sub.endpoint });
}

/** Sign-out: no reminders, cached pages or study data of this student stay on the device. */
export async function forgetDevice() {
  await disablePush().catch(() => {});
  (await activeWorker())?.postMessage({ type: "clear" });
  if ("caches" in window) for (const k of await caches.keys()) if (k.startsWith("dmc-")) await caches.delete(k);
  await clearOffline();
}
