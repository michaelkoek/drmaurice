/* DrMauriceCards service worker: offline pages + study-reminder notifications.
 *
 * Caches
 *  - pages:  HTML of visited (and pre-warmed) app pages, network-first. Served when offline.
 *  - static: hashed build files (/_next/static), fonts and icons, cache-first.
 * The student's data itself is not cached here but in IndexedDB by the app (lib/offline.ts).
 * API routes are never touched. Bump VERSION to drop all caches on the next visit.
 */
const VERSION = "v1";
const PAGES = `dmc-pages-${VERSION}`;
const STATIC = `dmc-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icon-192.png", "/badge-96.png", "/manifest.webmanifest"];
// pages with data rendered on the server, or that only make sense online
const NEVER_CACHE = ["/beheer", "/betalen", "/api/"];
const SIG_KEY = "/__dmc_build";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([PAGES, STATIC]);
    for (const k of await caches.keys()) if (k.startsWith("dmc-") && !keep.has(k)) await caches.delete(k);
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

const pageKey = (url) => new URL(url, self.location.origin).pathname.replace(/\/$/, "") || "/";
const cacheable = (path) => !NEVER_CACHE.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : p + "/"));
const isStatic = (path) => path.startsWith("/_next/static/") || /^\/(icon|badge|apple-icon)[\w-]*\.(png|svg)$/.test(path) || path === "/manifest.webmanifest";
// a redirect (to /login or /betalen) or error page must never stand in for the real page
const goodPage = (res) => res && res.ok && !res.redirected && res.type === "basic" && (res.headers.get("content-type") || "").includes("text/html");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(page(event, url));
  } else if (isStatic(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
  // everything else (RSC requests for client-side navigation, prefetches) goes to the network as usual;
  // when that fails offline, Next.js falls back to a full page load, which `page()` answers from the cache
});

async function page(event, url) {
  const path = pageKey(url);
  try {
    const res = (await event.preloadResponse) || (await fetch(event.request));
    if (cacheable(path) && goodPage(res)) {
      const copy = res.clone();
      event.waitUntil(caches.open(PAGES).then((c) => c.put(path, copy)));
    }
    return res;
  } catch {
    const cache = await caches.open(PAGES);
    return (await cache.match(path)) || (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

/* ── Pre-warming ────────────────────────────────────────────────────────────────
 * The app posts { type: "warm", pages, assets, build } after loading the student's data, so
 * lessons that were never opened still open offline. `build` identifies the deployment: when it
 * changes, every page is fetched again and build files no page refers to any more are dropped. */
self.addEventListener("message", (event) => {
  const msg = event.data || {};
  if (msg.type === "warm") event.waitUntil(warm(msg).catch((e) => console.warn("[sw] warm", e)));
  if (msg.type === "clear") event.waitUntil(clearAll());
});

const ASSET_RE = /(?:\/_next\/)?static\/(?:chunks|css|media)\/[\w\-.~%@/]+?\.(?:js|css|woff2?|ttf|png|svg|jpe?g|webp)/g;
const assetsIn = (text) => [...new Set((text.match(ASSET_RE) || []).map((a) => (a.startsWith("/") ? a : "/_next/" + a)))];

async function warm({ pages = [], assets = [], build = "" }) {
  const pageCache = await caches.open(PAGES);
  const staticCache = await caches.open(STATIC);
  const prev = await staticCache.match(SIG_KEY).then((r) => (r ? r.text() : null));
  const newBuild = build && prev !== build;

  const used = new Set(assets.filter((a) => a.startsWith("/_next/static/")));
  for (const p of pages.map(pageKey).filter(cacheable)) {
    let html = null;
    const cached = await pageCache.match(p);
    if (cached && !newBuild) html = await cached.text();
    else {
      const res = await fetch(p, { credentials: "same-origin" }).catch(() => null);
      if (!goodPage(res)) { if (res && !res.ok && res.status === 404) await pageCache.delete(p); continue; }
      html = await res.clone().text();
      await pageCache.put(p, res);
    }
    for (const a of assetsIn(html)) used.add(a);
  }
  // fetch what the pages need; CSS files pull in their fonts
  for (const a of [...used]) {
    let hit = await staticCache.match(a);
    if (!hit) {
      const res = await fetch(a).catch(() => null);
      if (!res || !res.ok) continue;
      await staticCache.put(a, res.clone());
      hit = res;
    }
    if (a.endsWith(".css")) for (const f of assetsIn(await hit.text())) {
      used.add(f);
      if (!(await staticCache.match(f))) { const r = await fetch(f).catch(() => null); if (r && r.ok) await staticCache.put(f, r); }
    }
  }
  if (newBuild) {
    for (const req of await staticCache.keys()) {
      const path = new URL(req.url).pathname;
      if (path.startsWith("/_next/static/") && !used.has(path)) await staticCache.delete(req);
    }
    await staticCache.put(SIG_KEY, new Response(build));
  }
}

async function clearAll() {
  for (const k of await caches.keys()) if (k.startsWith("dmc-")) await caches.delete(k);
}

/* ── Notifications ─────────────────────────────────────────────────────────────── */
self.addEventListener("push", (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; } catch { msg = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(msg.title || "DrMauriceCards", {
    body: msg.body || "",
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    tag: msg.tag || "dmc",
    lang: "nl",
    data: { url: msg.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === target.origin);
    if (win) {
      await win.focus();
      return win.navigate(target.href).catch(() => {});
    }
    return self.clients.openWindow(target.href);
  })());
});

// the push service rotated the subscription: subscribe again and tell the server (cookies come along)
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  event.waitUntil((async () => {
    const options = old?.options ?? (await self.registration.pushManager.getSubscription())?.options;
    if (!options) return;
    const sub = event.newSubscription ?? (await self.registration.pushManager.subscribe(options));
    await fetch("/api/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "subscribe", subscription: sub.toJSON(), replaces: old?.endpoint }),
    });
  })());
});
