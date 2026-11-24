"use client";

import WatchHelp from "./WatchHelp";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, localToday, type Me } from "./client";
import { IconChart, IconCheck, IconCompare, IconFlag, IconPin, IconPlan, IconPlus, IconRecap, IconRuns, IconSearch, IconSync, IconTerrain, IconToday, IconUser, Logo } from "./icons";
import Races from "./Races";
import Panels from "./Panels";
import Palette, { openPalette, type Command } from "./Palette";
import { openPanel, setPick } from "./panel";
import { APPEARANCES, getAuto, setAppearance, setAuto } from "@/components/appearance";
import BottomNav, { type Badge, type IslandMessage, type QuickAction } from "./BottomNav";
import { QUICK_EVENT, setQuick, takeQuick } from "./quick";
import { useSheetDrag, useSwipeTabs } from "./gestures";
import { UNDO_MS } from "./undo";
import PullRefresh from "./PullRefresh";
import CompactTop from "./CompactTop";
import Today from "./Today";
import Planning from "./Planning";
import Sessions from "./Sessions";
import Analysis from "./Analysis";
import Account from "./Account";
import XRay from "./XRay";
import Terrains from "./Terrains";
import ThemeToggle from "@/components/ThemeToggle";
import Flap from "./Flap";
import { startCountUps, startReveals, withTransition } from "./motion";
import Tour from "./Tour";

export type Tab = "today" | "plan" | "races" | "terrains" | "xray" | "runs" | "analysis" | "account";
const IconXray = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3.5c-.5 3 .2 5.5 1 8l-.6 5 1.1 4M16 3.5c.5 3-.2 5.5-1 8l.6 5-1.1 4" /><path d="M8.6 7.5h6.8M9.2 12h5.6" /></svg>
);
/** Pause : deux barres (absence). */
const IconPause = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M10 9v6M14 9v6" /></svg>;
/** Importer : flèche qui monte vers un plateau. */
const IconUpload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" /><path d="M4 14.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" /></svg>
);
/** Sur téléphone, la barre du bas n’a que cinq onglets : X-Ray et Séances se rangent sous Analyse, Mes courses sous Planning (sélecteur en haut de page). */
const GROUPED: Tab[] = ["analysis", "xray", "runs"];
const PLAN_GROUP: Tab[] = ["plan", "races"];

const TABS: { id: Tab; label: string; Icon: () => React.JSX.Element }[] = [
  { id: "today", label: "Aujourd’hui", Icon: IconToday },
  { id: "plan", label: "Planning", Icon: IconPlan },
  { id: "races", label: "Mes courses", Icon: IconFlag },
  { id: "terrains", label: "Terrains", Icon: IconTerrain },
  { id: "xray", label: "X-Ray", Icon: IconXray },
  { id: "runs", label: "Séances", Icon: IconRuns },
  { id: "analysis", label: "Analyse", Icon: IconChart },
  { id: "account", label: "Compte", Icon: IconUser },
];

const STRAVA_MSG: Record<string, string> = {
  connecte: "Strava est connecté. Tes sorties sont importées.",
  refuse: "Connexion Strava annulée.",
  droits: "Autorise la lecture des activités pour importer tes sorties.",
  erreur: "La connexion Strava a échoué. Réessaie.",
  non_configure: "Strava n’est pas encore configuré sur le site.",
};

/** Message avec action (« Annuler ») : bouton dans l'île dynamique (ou le message en bas sur ordinateur). */
export interface ToastOpts { action?: { label: string; run: () => void }; ms?: number }
export interface Ctx { me: Me; refresh: () => Promise<void>; go: (t: Tab) => void; toast: (m: string, o?: ToastOpts) => void }

export default function AppShell({ user }: { user: { name: string | null; email: string } }) {
  const [tab, setTab] = useState<Tab>("today");
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToast] = useState<IslandMessage | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [viaVT, setViaVT] = useState(false);
  const [stale, setStale] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(async () => {
    try { setMe(await api<Me>("/api/me")); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  }, []);

  // Messages : dans la barre du bas sur téléphone (île dynamique), en bas de l'écran sur ordinateur.
  const toast = useCallback((m: string, o: ToastOpts = {}) => {
    const k = Date.now() + Math.random();
    const ms = o.action ? o.ms ?? UNDO_MS : Math.min(6500, 2800 + m.length * 25);
    setToast({ text: m, k, action: o.action, ms });
    window.setTimeout(() => setToast((t) => (t?.k === k ? null : t)), ms);
  }, []);
  useEffect(() => { const on = (e: Event) => toast((e as CustomEvent<string>).detail); window.addEventListener("tp-toast", on); return () => window.removeEventListener("tp-toast", on); }, [toast]);

  // Mode hors ligne : service worker, état du réseau et date des données affichées.
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    setOnline(navigator.onLine);
    const onData = (e: Event) => setStale((e as CustomEvent<number>).detail || null);
    const up = () => { setOnline(true); setStale(null); refresh(); };
    const down = () => setOnline(false);
    window.addEventListener("tp-data", onData); window.addEventListener("online", up); window.addEventListener("offline", down);
    return () => { window.removeEventListener("tp-data", onData); window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [refresh]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const s = url.searchParams.get("strava");
    const t = url.hash.replace("#", "") as Tab;
    if (TABS.some((x) => x.id === t)) setTab(t);
    if (s && STRAVA_MSG[s]) { toast(STRAVA_MSG[s]); url.searchParams.delete("strava"); window.history.replaceState(null, "", url.pathname + url.hash); }
    refresh();
  }, [refresh, toast]);

  // Synchro Strava automatique : à l’ouverture de l’appli, à chaque retour sur l’onglet et toutes les 10 minutes
  // tant qu’elle reste ouverte. Le serveur limite la fréquence réelle ; les séances du jour sont validées dans la foulée.
  const linked = !!me?.strava.connected;
  useEffect(() => {
    if (!linked) return;
    let busy = false, last = 0;
    const sync = async () => {
      if (busy || document.visibilityState !== "visible" || !navigator.onLine || Date.now() - last < 60000) return;
      busy = true; last = Date.now(); setSyncing(true);
      try {
        const r = await api<{ added?: number; analyzed?: number; skipped?: boolean }>(`/api/strava/sync?auto=1&today=${localToday()}`, { method: "POST" });
        if (!r.skipped) {
          await refresh();
          window.dispatchEvent(new CustomEvent("tp-synced", { detail: r.added ?? 0 }));
          if (r.added) toast(`${r.added} nouvelle${r.added > 1 ? "s" : ""} sortie${r.added > 1 ? "s" : ""} Strava importée${r.added > 1 ? "s" : ""}. Ton planning est à jour.`);
        }
      } catch { /* la synchro automatique reste silencieuse : l’état s’affiche dans Séances */ }
      finally { busy = false; setSyncing(false); }
    };
    sync();
    const onVis = () => { if (document.visibilityState === "visible") sync(); };
    document.addEventListener("visibilitychange", onVis); window.addEventListener("focus", onVis);
    const timer = window.setInterval(sync, 10 * 60000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); window.clearInterval(timer); };
  }, [linked, refresh, toast]);

  // Indicateur d’onglet qui glisse sous l’onglet actif (barre latérale ; la barre du bas a le sien, BottomNav).
  const sideNav = useRef<HTMLElement>(null), mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      for (const nav of [sideNav.current]) {
        const ind = nav?.querySelector<HTMLElement>(".nav-ind"), on = nav?.querySelector<HTMLElement>(".navbtn.on");
        if (!ind || !on) continue;
        ind.style.width = `${on.offsetWidth}px`; ind.style.height = `${on.offsetHeight}px`;
        ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [tab]);
  useEffect(() => (mainRef.current ? startCountUps(mainRef.current) : undefined), []);
  useEffect(() => (mainRef.current ? startReveals(mainRef.current) : undefined), []);
  useEffect(() => { const el = document.querySelector<HTMLElement>(".side"); return el ? startCountUps(el) : undefined; }, []);

  // Changement d’onglet : la vue glisse dans le sens de la navigation (transition de vue native).
  const go = (t: Tab) => {
    window.history.replaceState(null, "", `#${t}`);
    if (t === tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const dir = TABS.findIndex((x) => x.id === t) > TABS.findIndex((x) => x.id === tab) ? "fwd" : "back";
    // Avec une transition de page, la nouvelle vue n'a pas besoin de sa propre animation d'entrée (sinon elle se
    // rejouerait juste après le glissé : c'était le « saut » au changement d'onglet).
    const vt = "startViewTransition" in document && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    withTransition(() => { flushSync(() => { setViaVT(vt); setTab(t); }); window.scrollTo({ top: 0 }); }, dir);
  };
  const ctx = me ? { me, refresh, go, toast } : null;

  // Balayer la page passe à la section voisine de la barre du bas ; glisser une fenêtre du bas la ferme.
  const NAV = TABS.filter((t) => (!GROUPED.includes(t.id) || t.id === "analysis") && t.id !== "races");
  const goRef = useRef(go); goRef.current = go;
  const tabRef = useRef(tab); tabRef.current = tab;
  const navOrder = useRef(NAV.map((t) => t.id as string)).current;
  const currentNav = useCallback(() => (GROUPED.includes(tabRef.current) ? "analysis" : PLAN_GROUP.includes(tabRef.current) ? "plan" : tabRef.current), []);
  const goNav = useCallback((id: string) => goRef.current(id as Tab), []);
  useSwipeTabs(mainRef, navOrder, currentNav, goNav);
  // Adresse modifiée à la main ou lien interne (#races…) : l'onglet suit.
  useEffect(() => {
    const on = () => { const t = window.location.hash.replace("#", "") as Tab; if (TABS.some((x) => x.id === t) && t !== tabRef.current) goRef.current(t); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  // Changement d'onglet demandé par un écran qui n'a pas `go` sous la main (en-tête d'Analyse…).
  useEffect(() => { const on = (e: Event) => goRef.current((e as CustomEvent<Tab>).detail); window.addEventListener("tp-go", on); return () => window.removeEventListener("tp-go", on); }, []);
  useSheetDrag();

  // Actions rapides du bouton + de la barre du bas.
  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await api<{ added?: number }>(`/api/strava/sync?today=${localToday()}`, { method: "POST" });
      await refresh();
      window.dispatchEvent(new CustomEvent("tp-synced", { detail: r.added ?? 0 }));
      toast(r.added ? `${r.added} nouvelle${r.added > 1 ? "s" : ""} sortie${r.added > 1 ? "s" : ""} importée${r.added > 1 ? "s" : ""}.` : "Tout est à jour : aucune nouvelle sortie.");
    } catch (e) { toast(e instanceof Error ? e.message : "La synchro a échoué."); }
    finally { setSyncing(false); }
  };
  // Tirer pour actualiser : synchro Strava si elle est branchée, sinon on recharge les données.
  const pullRefresh = async () => {
    if (me?.strava.connected) { await syncNow(); return; }
    await refresh();
    window.dispatchEvent(new CustomEvent("tp-synced", { detail: 0 }));
    toast("Données à jour.");
  };

  // ---------- Pastilles de la barre du bas ----------
  // Analyse : nouvelles sorties depuis la dernière visite d'Analyse, X-Ray ou Séances.
  // Planning : séance prévue aujourd'hui, tant que Planning n'a pas été ouvert dans la journée.
  // Aujourd'hui : check-in pas encore fait.
  const [seen, setSeen] = useState<{ act: number | null; plan: string | null }>({ act: null, plan: null });
  useEffect(() => {
    try { const a = localStorage.getItem("tp-seen-act"); setSeen({ act: a == null ? null : Number(a), plan: localStorage.getItem("tp-seen-plan") }); } catch { /* navigation privée */ }
  }, []);
  const maxAct = me ? me.recent.reduce((m, a) => Math.max(m, a.id), 0) : 0;
  useEffect(() => {
    if (!me) return;
    const mark = (k: "act" | "plan", v: number | string) => { try { localStorage.setItem(k === "act" ? "tp-seen-act" : "tp-seen-plan", String(v)); } catch { /* */ } setSeen((x) => ({ ...x, [k]: v })); };
    // Première visite : rien de « nouveau » à signaler.
    if (seen.act == null || GROUPED.includes(tab)) { if (seen.act !== maxAct) mark("act", maxAct); }
    if (tab === "plan" && seen.plan !== me.today) mark("plan", me.today);
  }, [me, tab, maxAct, seen.act, seen.plan]);
  const fresh = me && seen.act != null ? me.recent.filter((a) => a.id > seen.act!).length : 0;
  const navTab = GROUPED.includes(tab) ? "analysis" : PLAN_GROUP.includes(tab) ? "plan" : tab;
  const badges: Record<string, Badge | null> = {
    today: me && !me.checkin && navTab !== "today" ? { label: "check-in à faire" } : null,
    plan: me?.todayPlan?.status === "planned" && seen.plan !== me.today && navTab !== "plan" ? { label: "séance prévue aujourd’hui" } : null,
    analysis: fresh > 0 && navTab !== "analysis" ? { label: `${fresh} nouvelle${fresh > 1 ? "s" : ""} sortie${fresh > 1 ? "s" : ""}`, count: fresh } : null,
  };

  // Courses (chargées à l'ouverture de la recherche rapide).
  const paletteExtra = useCallback(async () => {
    const r = await api<{ races: { key: string; name: string; date: string; past: boolean; main: boolean }[] }>("/api/races?all=1");
    return r.races.map((x) => ({ id: `race-${x.key}`, group: "Courses", label: x.name, hint: `${new Date(`${x.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}${x.past ? " · débrief" : " · à venir"}`, Icon: IconFlag, keywords: "course debrief",
      run: () => (x.past ? openPanel({ kind: "race", key: x.key }) : goRef.current(x.main ? "plan" : "races")) }));
  }, []);
  // Mode « comparer » : on choisit deux sorties dans Séances.
  const startCompare = () => { setPick({ on: true, ids: [] }); go("runs"); };

  // ---------- Raccourcis (appui long sur une icône de la barre) ----------
  const jump = (t: Tab, sel: string, opts: { text?: string; press?: boolean } = {}) => () => { setQuick({ kind: "jump", sel, ...opts }); go(t); };
  const shortcuts: Record<string, QuickAction[]> = {
    today: [
      { id: "ci", label: "Check-in du jour", hint: "Sommeil, jambes, motivation", Icon: IconCheck, onSelect: () => { setQuick({ kind: "checkin" }); go("today"); } },
      { id: "next", label: "Séance du jour", hint: "Ce qui est prévu", Icon: IconPlan, onSelect: jump("today", "#next-title") },
      { id: "last", label: "Ma dernière sortie", hint: "Profil, allure, charge", Icon: IconRuns, onSelect: jump("today", ".night") },
    ],
    plan: [
      { id: "today", label: "Séance du jour", hint: "Ouvrir son détail", Icon: IconPlan, onSelect: jump("plan", "li.item.today button[aria-expanded]", { press: true }) },
      { id: "race", label: "Ma course", hint: "Temps estimé, stratégie", Icon: IconFlag, onSelect: jump("plan", ".race") },
      { id: "away", label: "Je ne peux pas courir", hint: "Malade, blessé, en déplacement", Icon: IconPause, onSelect: jump("plan", "button.btn", { text: "Imprévu", press: true }) },
      { id: "races", label: "Mes courses", hint: "Résultats, débriefs, comparaisons", Icon: IconFlag, onSelect: () => go("races") },
    ],
    terrains: [
      { id: "near", label: "Autour de moi", hint: "Chercher depuis ma position", Icon: IconPin, onSelect: jump("terrains", "button.btn", { text: "Ma position", press: true }) },
      { id: "saved", label: "Mes terrains", hint: "Ceux que j’ai enregistrés", Icon: IconTerrain, onSelect: jump("terrains", ".seg button, .view-switch button", { text: "Mes terrains", press: true }) },
    ],
    analysis: [
      { id: "form", label: "Ma forme", hint: "Charge, fraîcheur, VO2max", Icon: IconChart, onSelect: () => go("analysis") },
      { id: "xray", label: "X-Ray", hint: "Sollicitation du corps", Icon: IconXray, onSelect: () => go("xray") },
      { id: "runs", label: "Séances", hint: "Toutes mes sorties", Icon: IconRuns, onSelect: () => go("runs") },
      { id: "recap", label: "Bilan du mois", hint: "Ton mois en story", Icon: IconRecap, onSelect: () => openPanel({ kind: "recap" }) },
      { id: "cmp", label: "Comparer 2 sorties", hint: "Côte à côte, kilomètre par kilomètre", Icon: IconCompare, onSelect: startCompare },
    ],
    account: [
      { id: "ap", label: "Apparence", hint: "Jour, Nuit, Verre, Topo, Frontale", Icon: IconUser, onSelect: jump("account", "[data-fold=acc-appearance]") },
      { id: "strava", label: "Strava", hint: "Connexion et import", Icon: IconSync, onSelect: jump("account", "[data-fold=acc-strava]") },
      { id: "rem", label: "Rappel du check-in", hint: "Notification du matin", Icon: IconCheck, onSelect: jump("account", "[data-fold=acc-reminder]") },
    ],
  };
  // Raccourci « aller à » : une fois la page ouverte, on attend l'élément, on le déplie s'il est replié, on
  // touche le bouton visé s'il le faut, puis on l'amène à l'écran avec un bref halo.
  useEffect(() => {
    let cancel = false;
    // Écoute posée une fois : l'attente de l'élément survit au changement d'onglet qu'elle accompagne.
    const on = () => {
      const q = takeQuick("jump");
      if (!q) return;
      const t0 = performance.now();
      const find = () => [...document.querySelectorAll<HTMLElement>(`.view ${q.sel}`)].find((e) => !q.text || e.textContent?.includes(q.text));
      let unfolded = false;
      const tick = () => {
        if (cancel) return;
        // Rubrique repliée qui contient l'élément : on la déplie d'abord (une fois).
        if (q.fold && !unfolded) { const f = document.querySelector<HTMLElement>(`.view [data-fold="${q.fold}"]`); if (f) { unfolded = true; if (f.matches(".is-closed")) f.querySelector<HTMLElement>(".fold-btn")?.click(); } }
        const el = find();
        if (!el) { if (performance.now() - t0 < 4000) window.setTimeout(tick, 120); return; }
        if (el.matches(".fold.is-closed")) el.querySelector<HTMLElement>(".fold-btn")?.click();
        if (q.press) el.click();
        const target = el.closest<HTMLElement>(".card, li, section") ?? el;
        window.setTimeout(() => {
          target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
          target.classList.add("is-flash");
          window.setTimeout(() => target.classList.remove("is-flash"), 1600);
        }, 120);
      };
      window.setTimeout(tick, 350);
    };
    window.addEventListener(QUICK_EVENT, on);
    return () => { cancel = true; window.removeEventListener(QUICK_EVENT, on); };
  }, []);
  const quick: QuickAction[] = [
    { id: "add", label: "Ajouter une sortie", hint: "Saisie à la main", Icon: IconPlus, onSelect: () => { setQuick({ kind: "add" }); go("runs"); } },
    { id: "file", label: "Importer un fichier", hint: "GPX, FIT ou TCX de ta montre", Icon: IconUpload, file: { accept: ".gpx,.fit,.tcx,application/gpx+xml", onFile: (f) => { setQuick({ kind: "file", file: f }); go("runs"); } } },
    { id: "checkin", label: "Check-in du jour", hint: "Sommeil, jambes, motivation", Icon: IconCheck, onSelect: () => { setQuick({ kind: "checkin" }); go("today"); } },
    ...(me?.strava.connected
      ? [{ id: "sync", label: "Synchro Strava", hint: "Importer tes dernières sorties", Icon: IconSync, onSelect: syncNow }]
      : me?.strava.configured ? [{ id: "strava", label: "Connecter Strava", hint: "Tes sorties arrivent toutes seules", Icon: IconSync, onSelect: () => { window.location.href = "/api/strava/connect"; } }] : []),
  ];
  const initial = (user.name ?? user.email).slice(0, 1).toUpperCase();

  // ---------- Recherche rapide (Ctrl+K) ----------
  const GROUP_HINT: Partial<Record<Tab, string>> = { today: "Décision du jour, check-in", plan: "Séances jusqu’au jour J", races: "Résultats et débriefs", terrains: "Où courir", xray: "Sollicitation du corps", runs: "Toutes tes sorties", analysis: "Forme, charge, VO2max", account: "Réglages, Strava, apparence" };
  const commands: Command[] = [
    ...TABS.map((t) => ({ id: `tab-${t.id}`, group: "Aller à", label: t.label, hint: GROUP_HINT[t.id], Icon: t.Icon, run: () => go(t.id) })),
    ...quick.filter((a) => !a.file).map((a) => ({ id: `q-${a.id}`, group: "Actions", label: a.label, hint: a.hint, Icon: a.Icon, run: () => a.onSelect?.() })),
    { id: "q-recap", group: "Actions", label: "Bilan du mois", hint: "Ton mois en story", Icon: IconRecap, keywords: "mois story resume", run: () => openPanel({ kind: "recap" }) },
    { id: "q-cmp", group: "Actions", label: "Comparer deux sorties", hint: "Côte à côte", Icon: IconCompare, keywords: "comparaison duel", run: startCompare },
    ...Object.entries(shortcuts).flatMap(([t, list]) => list.filter((a) => !["form", "xray", "runs", "races", "recap", "cmp"].includes(a.id)).map((a) => ({ id: `s-${t}-${a.id}`, group: "Raccourcis", label: a.label, hint: a.hint, Icon: a.Icon, run: () => a.onSelect?.() }))),
    ...APPEARANCES.map((x) => ({ id: `ap-${x.id}`, group: "Apparence", label: `Mode ${x.label}`, hint: x.hint, keywords: "theme apparence couleur", run: () => setAppearance(x.id, document.querySelector<HTMLElement>(".ap-toggle")) })),
    { id: "ap-auto", group: "Apparence", label: getAuto() ? "Couper le mode automatique" : "Mode automatique", hint: "Jour le jour, Nuit après le coucher du soleil", keywords: "auto soleil", run: () => setAuto(getAuto() ? null : { day: "light", night: "dark" }) },
    ...(me?.recent ?? []).slice(0, 12).map((a) => ({ id: `run-${a.id}`, group: "Sorties récentes", label: a.name ?? "Sortie", hint: `${new Date(`${a.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}${a.distance_km ? ` · ${String(Math.round(a.distance_km * 10) / 10).replace(".", ",")} km` : ""}`, Icon: IconRuns, keywords: a.sport, run: () => openPanel({ kind: "run", id: a.id, initial: a }) })),
  ];

  return (
    <div className="shell">
      <aside className="side">
        <a className="logo" href="/"><Logo /><span>TRAIL PILOT</span></a>
        <nav aria-label="Sections" ref={sideNav}>
          <span className="nav-ind" aria-hidden="true" />
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} data-tab={id} className={`navbtn ${tab === id ? "on" : ""}`} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined}><Icon />{label}</button>
          ))}
        </nav>
        {me?.goal && (
          <button className="side-goal" onClick={() => go("plan")} style={{ textAlign: "left", cursor: "pointer", color: "inherit" }}>
            <small>{me.goal.phase}</small>
            <Flap days={me.goal.daysToGoal ?? 0} />
            <span>{me.goal.name}</span>
          </button>
        )}
        <button type="button" className="side-search" onClick={openPalette} aria-keyshortcuts="Control+K Meta+K"><IconSearch /><span>Rechercher</span><kbd>Ctrl K</kbd></button>
        <div className="side-foot" style={me?.goal ? undefined : { marginTop: "auto" }}>
          <div className="side-user" style={{ minWidth: 0 }}>
            <span className="avatar">{initial}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name ?? user.email}</span>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <main className="main" ref={mainRef}>
        <WatchHelp />
        {!online && (
          <div className="offline-bar" role="status">
            <b>Hors ligne</b>
            <span>{stale ? `Données du ${new Date(stale).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. ` : ""}Tu peux consulter ton planning ; les modifications reprendront avec le réseau.</span>
          </div>
        )}
        <div className="mobile-top">
          <a className="logo" href="/"><Logo />TRAIL PILOT</a>
          <div className="row" style={{ gap: 8 }}>
            {me?.goal && <span className="chip ember">{me.goal.daysToGoal! > 0 ? `J-${me.goal.daysToGoal}` : "Jour J"}</span>}
            <ThemeToggle />
          </div>
        </div>
        {error && !me && <p className="note err">{error} <button className="link" onClick={refresh}>Réessayer</button></p>}
        {GROUPED.includes(tab) && (
          <div className="subnav seg" role="tablist" aria-label="Analyse, X-Ray et séances">
            {TABS.filter((t) => GROUPED.includes(t.id)).sort((a, b) => GROUPED.indexOf(a.id) - GROUPED.indexOf(b.id)).map(({ id, label }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => go(id)}>{label}</button>
            ))}
          </div>
        )}
        {PLAN_GROUP.includes(tab) && (
          <div className="subnav seg subnav-plan" role="tablist" aria-label="Planning et mes courses">
            {PLAN_GROUP.map((id) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => go(id)}>{TABS.find((t) => t.id === id)!.label}</button>
            ))}
          </div>
        )}
        {!ctx ? (
          <div className="grid g2"><div className="skeleton" /><div className="skeleton" /></div>
        ) : (
          <div className={`view${viaVT ? " no-in" : ""}`} key={tab}>
            {tab === "today" && !ctx.me.goal && (
              <div className="banner" style={{ marginBottom: 14 }}>
                <div><b>Choisis ta course</b><div className="small muted">Un plan d’entraînement jusqu’au jour J, construit à partir de ta charge actuelle pour que tu finisses.</div></div>
                <button className="btn sm" onClick={() => go("plan")}>Choisir ma course</button>
              </div>
            )}
            {tab === "today" && <Today {...ctx} />}
            {tab === "plan" && <Planning {...ctx} />}
            {tab === "races" && <Races {...ctx} />}
            {tab === "terrains" && <Terrains {...ctx} />}
            {tab === "xray" && <XRay {...ctx} />}
            {tab === "runs" && <Sessions {...ctx} />}
            {tab === "analysis" && <Analysis {...ctx} />}
            {tab === "account" && <Account {...ctx} />}
          </div>
        )}
      </main>

      <BottomNav
        items={NAV}
        active={navTab}
        onSelect={(id) => go(id as Tab)}
        actions={ctx ? quick : []}
        badges={badges}
        shortcuts={ctx ? shortcuts : {}}
        message={toastMsg}
        onDismiss={() => setToast(null)}
        busy={syncing}
      />
      {ctx && <PullRefresh onRefresh={pullRefresh} />}
      <CompactTop tab={tab} version={me?.checkin ? 1 : 0} />
      {toastMsg && (
        <div className={`toast${toastMsg.action ? " has-act" : ""}`} key={toastMsg.k} style={toastMsg.action ? { ["--msg-ms" as string]: `${toastMsg.ms}ms` } : undefined}>
          <span role="status">{toastMsg.text}</span>
          {toastMsg.action && <button type="button" className="toast-act" onClick={() => { toastMsg.action!.run(); setToast(null); }}>{toastMsg.action.label}</button>}
        </div>
      )}
      {ctx && !ctx.me.onboarding && <Tour go={go} />}
      {ctx && <Panels ctx={ctx} />}
      {ctx && <Palette commands={commands} extra={paletteExtra} />}
    </div>
  );
}
