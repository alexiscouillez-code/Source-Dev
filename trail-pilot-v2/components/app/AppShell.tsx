"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, type Me } from "./client";
import { IconChart, IconPlan, IconRuns, IconTerrain, IconToday, IconUser, Logo } from "./icons";
import Today from "./Today";
import Planning from "./Planning";
import Sessions from "./Sessions";
import Analysis from "./Analysis";
import Account from "./Account";
import XRay from "./XRay";
import Terrains from "./Terrains";
import ThemeToggle from "@/components/ThemeToggle";
import Flap from "./Flap";
import { startCountUps, withTransition } from "./motion";
import Tour from "./Tour";

export type Tab = "today" | "plan" | "terrains" | "xray" | "runs" | "analysis" | "account";
const IconXray = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3.5c-.5 3 .2 5.5 1 8l-.6 5 1.1 4M16 3.5c.5 3-.2 5.5-1 8l.6 5-1.1 4" /><path d="M8.6 7.5h6.8M9.2 12h5.6" /></svg>
);
/** Sur téléphone, la barre du bas n’a que cinq onglets : X-Ray et Séances se rangent sous Analyse (sélecteur en haut de page). */
const GROUPED: Tab[] = ["analysis", "xray", "runs"];

const TABS: { id: Tab; label: string; Icon: () => React.JSX.Element }[] = [
  { id: "today", label: "Aujourd’hui", Icon: IconToday },
  { id: "plan", label: "Planning", Icon: IconPlan },
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

export interface Ctx { me: Me; refresh: () => Promise<void>; go: (t: Tab) => void; toast: (m: string) => void }

export default function AppShell({ user }: { user: { name: string | null; email: string } }) {
  const [tab, setTab] = useState<Tab>("today");
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToast] = useState<string | null>(null);
  const [stale, setStale] = useState<number | null>(null);
  const [online, setOnline] = useState(true);

  const refresh = useCallback(async () => {
    try { setMe(await api<Me>("/api/me")); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
  }, []);

  const toast = useCallback((m: string) => { setToast(m); window.setTimeout(() => setToast(null), 3600); }, []);
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

  // Indicateur d’onglet qui glisse sous l’onglet actif (barre latérale et barre du bas).
  const sideNav = useRef<HTMLElement>(null), tabNav = useRef<HTMLElement>(null), mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      for (const nav of [sideNav.current, tabNav.current]) {
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
  useEffect(() => { const el = document.querySelector<HTMLElement>(".side"); return el ? startCountUps(el) : undefined; }, []);

  // Changement d’onglet : la vue glisse dans le sens de la navigation (transition de vue native).
  const go = (t: Tab) => {
    window.history.replaceState(null, "", `#${t}`);
    if (t === tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const dir = TABS.findIndex((x) => x.id === t) > TABS.findIndex((x) => x.id === tab) ? "fwd" : "back";
    withTransition(() => { flushSync(() => setTab(t)); window.scrollTo({ top: 0 }); }, dir);
  };
  const ctx = me ? { me, refresh, go, toast } : null;
  const initial = (user.name ?? user.email).slice(0, 1).toUpperCase();

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
        <div className="side-foot" style={me?.goal ? undefined : { marginTop: "auto" }}>
          <div className="side-user" style={{ minWidth: 0 }}>
            <span className="avatar">{initial}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name ?? user.email}</span>
          </div>
          <ThemeToggle />
        </div>
      </aside>

      <main className="main" ref={mainRef}>
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
        {!ctx ? (
          <div className="grid g2"><div className="skeleton" /><div className="skeleton" /></div>
        ) : (
          <div className="view" key={tab}>
            {tab === "today" && !ctx.me.goal && (
              <div className="banner" style={{ marginBottom: 14 }}>
                <div><b>Choisis ta course</b><div className="small muted">Un plan d’entraînement jusqu’au jour J, construit à partir de ta charge actuelle pour que tu finisses.</div></div>
                <button className="btn sm" onClick={() => go("plan")}>Choisir ma course</button>
              </div>
            )}
            {tab === "today" && <Today {...ctx} />}
            {tab === "plan" && <Planning {...ctx} />}
            {tab === "terrains" && <Terrains {...ctx} />}
            {tab === "xray" && <XRay {...ctx} />}
            {tab === "runs" && <Sessions {...ctx} />}
            {tab === "analysis" && <Analysis {...ctx} />}
            {tab === "account" && <Account {...ctx} />}
          </div>
        )}
      </main>

      <nav className="tabbar" aria-label="Sections" ref={tabNav}>
        <span className="nav-ind" aria-hidden="true" />
        {TABS.filter((t) => !GROUPED.includes(t.id) || t.id === "analysis").map(({ id, label, Icon }) => {
          const on = tab === id || (id === "analysis" && GROUPED.includes(tab));
          return <button key={id} data-tab={id} className={`navbtn ${on ? "on" : ""}`} onClick={() => go(id)} aria-current={on ? "page" : undefined}><Icon />{label}</button>;
        })}
      </nav>
      {toastMsg && <div className="toast" role="status" key={toastMsg}>{toastMsg}</div>}
      {ctx && !ctx.me.onboarding && <Tour go={go} />}
    </div>
  );
}
