/* Trail Pilot : mode hors ligne et notifications (rappel du check-in du soir). */
const VERSION = "tp-6";
const STATIC = `${VERSION}-static`, PAGES = `${VERSION}-pages`, DATA = "tp-data", TILES = "tp-tiles";
const MAX_TILES = 600;
// Données de l’espace gardées pour la consultation hors ligne (dernière réponse reçue).
const API_CACHED = /^\/api\/(me|plan|activities|analysis|vo2|trail-profile|xray|races|weather|coach|calendar|terrains|week|progress)$/;
const TILE_HOSTS = /(^|\.)tile\.openstreetmap\.org$|(^|\.)tile\.opentopomap\.org$/;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(["/icon.svg", "/manifest.webmanifest"]).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (![STATIC, PAGES, DATA, TILES].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const dataKey = (url) => { const u = new URL(url); u.searchParams.delete("today"); return u.toString(); };
const clearPrivate = () => Promise.all([caches.delete(DATA), caches.delete(PAGES)]);

async function networkFirst(request, cacheName, key, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const res = await Promise.race([fetch(request), new Promise((_, ko) => setTimeout(() => ko(new Error("timeout")), timeoutMs))]);
    if (res.ok && res.type === "basic") {
      const headers = new Headers(res.headers); headers.set("X-TP-Saved", String(Date.now()));
      const body = await res.clone().blob();
      await cache.put(key, new Response(body, { status: res.status, statusText: res.statusText, headers }));
    }
    if (res.status === 401) await clearPrivate();
    return res;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") {
    await cache.put(request, res.clone());
    if (limit) { const keys = await cache.keys(); for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]); }
  }
  return res;
}

const OFFLINE_HTML = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hors ligne · Trail Pilot</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f14;color:#f4efe6;font:16px/1.5 system-ui,sans-serif;padding:24px;text-align:center}b{display:block;font-size:22px;margin-bottom:8px}button{margin-top:16px;padding:12px 18px;border-radius:999px;border:0;background:#ff6a2b;color:#fff;font:inherit;font-weight:600}</style>
<div><b>Pas de réseau</b>Ouvre Trail Pilot une fois connecté : ton planning et tes données resteront ensuite consultables hors ligne.<br><button onclick="location.reload()">Réessayer</button></div></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (TILE_HOSTS.test(url.hostname)) event.respondWith(cacheFirst(req, TILES, MAX_TILES));
    return;
  }
  // Déconnexion : on efface les données gardées sur l’appareil.
  if (url.pathname === "/api/auth/logout") { event.respondWith(clearPrivate().then(() => fetch(req))); return; }
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg" || url.pathname === "/apple-icon") { event.respondWith(cacheFirst(req, STATIC)); return; }
  if (API_CACHED.test(url.pathname)) { event.respondWith(networkFirst(req, DATA, dataKey(req.url), 8000)); return; }
  if (req.mode === "navigate" && url.pathname === "/espace") {
    event.respondWith(networkFirst(req, PAGES, "/espace", 6000).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
  }
});

self.addEventListener("message", (event) => { if (event.data === "clear-private") event.waitUntil(clearPrivate()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Trail Pilot";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Ton check-in du soir t’attend : 10 secondes pour savoir quoi faire demain.",
    icon: "/apple-icon",
    badge: "/icon.svg",
    tag: data.tag || "checkin",
    renotify: false,
    data: { url: data.url || "/espace#today" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/espace#today";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).pathname.startsWith("/espace")) { await c.focus(); if ("navigate" in c) await c.navigate(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
