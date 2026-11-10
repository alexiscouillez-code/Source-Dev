"use client";

import { useEffect, useState } from "react";
import type { Ctx } from "./AppShell";
import { api, DAYS } from "./client";
import { HomeCard, ShoesCard } from "./Gear";

export default function Account({ me, refresh, toast, go }: Ctx) {
  return (
    <>
      <header className="head"><div><span className="eyebrow">{me.user.email}</span><h1>Compte</h1></div><a className="btn ghost sm" href="/api/auth/logout">Se déconnecter</a></header>
      <div className="grid g2">
        <RaceCard me={me} go={go} />
        <ProfileCard me={me} refresh={refresh} toast={toast} />
        <ShoesCard toast={toast} />
        <HomeCard toast={toast} />
        <ReminderCard me={me} refresh={refresh} toast={toast} />
        <CalendarCard toast={toast} />
        <StravaCard me={me} refresh={refresh} toast={toast} />
        <EmailCard me={me} toast={toast} />
        <HealthCard me={me} refresh={refresh} toast={toast} />
        <DataCard toast={toast} />
      </div>
    </>
  );
}

type P = Pick<Ctx, "me" | "refresh" | "toast">;

function useSubmit(toast: Ctx["toast"]) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setErr(null);
    try { await fn(); toast(ok); } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); } finally { setBusy(false); }
  };
  return { busy, err, run };
}

function RaceCard({ me, go }: Pick<Ctx, "me" | "go">) {
  const g = me.goal;
  return (
    <section className="card">
      <div className="card-head"><h2>Ma course</h2>{g && <span className="chip ember">{g.daysToGoal! > 0 ? `J-${g.daysToGoal}` : "Jour J"}</span>}</div>
      {g ? (
        <p className="soft" style={{ margin: 0 }}><b style={{ color: "var(--snow)" }}>{g.name}</b>, le {new Date(`${g.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}{g.distance_km ? ` · ${String(g.distance_km).replace(".", ",")} km` : ""}{g.gain_m ? ` · ${g.gain_m} m D+` : ""}.</p>
      ) : (
        <p className="soft" style={{ margin: 0 }}>Aucune course choisie. Choisis-en une pour obtenir un plan d’entraînement jusqu’au jour J.</p>
      )}
      <button className="btn ghost" style={{ justifySelf: "start" }} onClick={() => go("plan")}>{g ? "Voir mon plan" : "Choisir ma course"}</button>
    </section>
  );
}

function ProfileCard({ me, refresh, toast }: P) {
  const p = me.profile;
  const [f, setF] = useState({ name: me.user.name ?? "", level: p.level, daysPerWeek: p.days_per_week, longDay: p.long_day, maxWeeklyMinutes: p.max_weekly_minutes?.toString() ?? "", hrMax: p.hr_max?.toString() ?? "", hrRest: p.hr_rest?.toString() ?? "", vo2Watch: p.vo2_watch?.toString().replace(".", ",") ?? "" });
  const { busy, err, run } = useSubmit(toast);
  return (
    <section className="card">
      <div className="card-head"><h2>Profil d’entraînement</h2></div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); run(async () => { await api("/api/profile", { method: "PUT", body: { ...f, vo2Watch: f.vo2Watch.replace(",", ".") } }); await refresh(); }, "Profil enregistré, planning recalculé."); }}>
        <div className="fields">
          <label className="field">Prénom<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} /></label>
          <label className="field">Niveau
            <select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as typeof f.level })}>
              <option value="debutant">Je débute</option><option value="regulier">Régulier</option><option value="confirme">Confirmé</option>
            </select>
          </label>
          <label className="field">Séances par semaine
            <select value={f.daysPerWeek} onChange={(e) => setF({ ...f, daysPerWeek: Number(e.target.value) })}>{[2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <label className="field">Sortie longue le
            <select value={f.longDay} onChange={(e) => setF({ ...f, longDay: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          </label>
          <label className="field">FC max<input inputMode="numeric" value={f.hrMax} onChange={(e) => setF({ ...f, hrMax: e.target.value })} placeholder="188" /><small>Pour estimer l’effort sans ressenti</small></label>
          <label className="field">FC repos<input inputMode="numeric" value={f.hrRest} onChange={(e) => setF({ ...f, hrRest: e.target.value })} placeholder="50" /></label>
          <label className="field">VO2max de ta montre<input inputMode="decimal" value={f.vo2Watch} onChange={(e) => setF({ ...f, vo2Watch: e.target.value })} placeholder="Facultatif" /><small>Si renseignée, elle sert à calculer tes allures</small></label>
        </div>
        <label className="field">Temps max par semaine (min)<input inputMode="numeric" value={f.maxWeeklyMinutes} onChange={(e) => setF({ ...f, maxWeeklyMinutes: e.target.value })} placeholder="Sans limite" /></label>
        {err && <p className="note err">{err}</p>}
        <button className="btn" type="submit" disabled={busy}>Enregistrer</button>
      </form>
    </section>
  );
}

function StravaCard({ me, refresh, toast }: P) {
  const s = me.strava;
  const { busy, err, run } = useSubmit(toast);
  return (
    <section className="card">
      <div className="card-head"><h2>Strava</h2><span className={`chip ${s.connected ? "ok" : "dim"}`}><span className="dot" />{s.connected ? "Connecté" : "Non connecté"}</span></div>
      {!s.configured ? (
        <p className="muted" style={{ margin: 0 }}>La connexion Strava n’est pas encore activée sur le site.</p>
      ) : s.connected ? (
        <>
          <p className="soft" style={{ margin: 0 }}>Compte {s.athleteName ?? "Strava"}. {s.lastSyncAt ? `Dernière synchro le ${new Date(s.lastSyncAt).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.` : ""} Les nouvelles activités arrivent automatiquement.</p>
          {s.lastError && <p className="note err">{s.lastError}</p>}
          {err && <p className="note err">{err}</p>}
          <div className="row">
            <button className="btn ghost" disabled={busy} onClick={() => run(async () => { await api("/api/strava/sync", { method: "POST" }); await refresh(); }, "Synchronisation terminée.")}>Synchroniser</button>
            <button className="btn danger" disabled={busy} onClick={() => { if (confirm("Déconnecter Strava ? Les séances déjà importées restent dans ton journal.")) run(async () => { await api("/api/strava", { method: "DELETE" }); await refresh(); }, "Strava déconnecté."); }}>Déconnecter</button>
          </div>
        </>
      ) : (
        <>
          <p className="soft" style={{ margin: 0 }}>Importe tes 120 derniers jours, puis chaque nouvelle activité automatiquement. Trail Pilot ne lit que tes activités et ne publie rien.</p>
          <a className="btn strava" href="/api/strava/connect" style={{ justifySelf: "start" }}>Connecter Strava</a>
        </>
      )}
    </section>
  );
}

function DataCard({ toast }: Pick<Ctx, "toast">) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (prompt("Pour supprimer définitivement ton compte et toutes tes données, tape SUPPRIMER") !== "SUPPRIMER") return;
    setBusy(true);
    try { await api("/api/account", { method: "DELETE" }); window.location.assign("/"); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); setBusy(false); }
  }
  return (
    <section className="card">
      <div className="card-head"><h2>Mes données</h2></div>
      <p className="soft" style={{ margin: 0 }}>Tes séances, check-in et ton planning t’appartiennent. Télécharge-les à tout moment au format JSON.</p>
      <div className="row">
        <a className="btn ghost" href="/api/account" download>Exporter mes données</a>
        <button className="btn danger" onClick={del} disabled={busy}>Supprimer mon compte</button>
      </div>
    </section>
  );
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Rappel du check-in du soir par notification. */
function ReminderCard({ me, refresh, toast }: P) {
  const [support, setSupport] = useState<"ok" | "ios" | "no" | null>(null);
  const [perm, setPerm] = useState<NotificationPermission | null>(null);
  const [here, setHere] = useState(false);
  const { busy, err, run } = useSubmit(toast);

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setSupport(ios && !standalone ? "ios" : "no"); return; }
    setSupport("ok"); setPerm(Notification.permission);
    navigator.serviceWorker.getRegistration("/").then((r) => r?.pushManager.getSubscription()).then((sub) => setHere(!!sub)).catch(() => {});
  }, []);

  async function enable() {
    const { publicKey } = await api<{ publicKey: string | null }>("/api/push");
    if (!publicKey) throw new Error("Les notifications ne sont pas encore activées sur le site.");
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p !== "granted") throw new Error("Autorise les notifications pour Trail Pilot dans les réglages du navigateur.");
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
    await api("/api/push", { method: "POST", body: { subscription: sub.toJSON() } });
    setHere(true); await refresh();
  }
  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    await api("/api/push", { method: "DELETE", body: sub ? { endpoint: sub.endpoint } : {} });
    await sub?.unsubscribe();
    setHere(false); await refresh();
  }

  const on = me.settings.reminder && here;
  return (
    <section className="card">
      <div className="card-head"><h2>Rappel du check-in</h2><span className={`chip ${on ? "ok" : "dim"}`}><span className="dot" />{on ? "Activé" : "Désactivé"}</span></div>
      <p className="soft" style={{ margin: 0 }}>Chaque soir vers 20 h, une notification te rappelle ton check-in s’il n’est pas encore fait, avec la séance prévue le lendemain.</p>
      {!me.push ? <p className="muted small" style={{ margin: 0 }}>Les notifications ne sont pas encore activées sur le site.</p>
        : support === "ios" ? <p className="note small" style={{ margin: 0 }}>Sur iPhone, ajoute d’abord Trail Pilot à l’écran d’accueil (bouton Partager, puis « Sur l’écran d’accueil »), ouvre-le depuis l’icône et reviens ici.</p>
        : support === "no" ? <p className="muted small" style={{ margin: 0 }}>Ce navigateur ne gère pas les notifications.</p>
        : perm === "denied" ? <p className="note small" style={{ margin: 0 }}>Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur, puis réessaie.</p>
        : null}
      {err && <p className="note err">{err}</p>}
      {me.push && support === "ok" && (
        <div className="row">
          {on ? <button className="btn ghost" disabled={busy} onClick={() => run(disable, "Rappel désactivé.")}>Désactiver sur cet appareil</button>
            : <button className="btn" disabled={busy || perm === "denied"} onClick={() => run(enable, "Rappel activé : une notification de test vient de partir.")}>Activer le rappel</button>}
        </div>
      )}
      {me.settings.reminder && !here && support === "ok" && <p className="muted small" style={{ margin: 0 }}>Le rappel est actif sur un autre appareil.</p>}
    </section>
  );
}

/** Abonnement agenda : le plan apparaît dans Google Agenda, Apple Calendrier ou Outlook et se met à jour seul. */
function CalendarCard({ toast }: Pick<Ctx, "toast">) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const { busy, err, run } = useSubmit(toast);
  useEffect(() => { api<{ url: string | null }>("/api/calendar").then((r) => setUrl(r.url)).catch(() => setUrl(null)); }, []);
  const webcal = url?.replace(/^https?:/, "webcal:");
  async function copy() {
    try { await navigator.clipboard.writeText(url!); toast("Lien copié."); } catch { toast("Copie impossible : sélectionne le lien à la main."); }
  }
  return (
    <section className="card">
      <div className="card-head"><h2>Agenda</h2><span className={`chip ${url ? "ok" : "dim"}`}><span className="dot" />{url ? "Lien actif" : "Non relié"}</span></div>
      <p className="soft" style={{ margin: 0 }}>Ajoute ton plan à ton agenda : chaque séance apparaît le bon jour, avec sa durée et ses consignes, et se met à jour quand le plan change.</p>
      {url === undefined ? null : url ? (
        <>
          <div className="row">
            <a className="btn" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal!)}`} target="_blank" rel="noopener noreferrer">Google Agenda</a>
            <a className="btn ghost" href={webcal}>Apple / Outlook</a>
            <a className="btn ghost" href={`${url}?download=1`}>Télécharger (.ics)</a>
          </div>
          <div className="cal-url"><input readOnly value={url} aria-label="Lien d’abonnement" onFocus={(e) => e.currentTarget.select()} /><button className="btn ghost sm" type="button" onClick={copy}>Copier</button></div>
          <p className="muted small" style={{ margin: 0 }}>Ce lien est personnel : toute personne qui l’a voit ton planning. Google Agenda le relit toutes les quelques heures, Apple et Outlook plus souvent.</p>
          {err && <p className="note err">{err}</p>}
          <div className="row">
            <button className="btn ghost sm" disabled={busy} onClick={() => { if (confirm("Créer un nouveau lien ? L’ancien cessera de fonctionner : il faudra réabonner ton agenda.")) run(async () => setUrl((await api<{ url: string }>("/api/calendar", { method: "POST" })).url), "Nouveau lien créé."); }}>Nouveau lien</button>
            <button className="btn danger sm" disabled={busy} onClick={() => { if (confirm("Désactiver le lien ? Ton agenda ne recevra plus le planning.")) run(async () => { await api("/api/calendar", { method: "DELETE" }); setUrl(null); }, "Lien désactivé."); }}>Désactiver</button>
          </div>
        </>
      ) : (
        <>
          {err && <p className="note err">{err}</p>}
          <button className="btn" style={{ justifySelf: "start" }} disabled={busy} onClick={() => run(async () => setUrl((await api<{ url: string }>("/api/calendar", { method: "POST" })).url), "Lien d’agenda créé.")}>Relier mon agenda</button>
        </>
      )}
    </section>
  );
}

/** Confirmation de l’adresse e-mail. */
function EmailCard({ me, toast }: Pick<Ctx, "me" | "toast">) {
  const { busy, err, run } = useSubmit(toast);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    const u = new URL(window.location.href), v = u.searchParams.get("verif");
    if (!v) return;
    setFlash(v === "ok" ? "Adresse confirmée, merci !" : "Ce lien de confirmation n’est plus valable. Demandes-en un nouveau.");
    u.searchParams.delete("verif"); window.history.replaceState(null, "", u.pathname + u.hash);
  }, []);
  return (
    <section className="card">
      <div className="card-head"><h2>Adresse e-mail</h2><span className={`chip ${me.user.emailVerified ? "ok" : "lite"}`}><span className="dot" />{me.user.emailVerified ? "Confirmée" : "À confirmer"}</span></div>
      <p className="soft" style={{ margin: 0 }}>{me.user.email}. {me.user.emailVerified ? "Tu pourras récupérer ton compte si tu oublies ton mot de passe." : "Confirme-la pour pouvoir récupérer ton compte si tu oublies ton mot de passe."}</p>
      {flash && <p className="note small" style={{ margin: 0 }}>{flash}</p>}
      {err && <p className="note err">{err}</p>}
      {!me.user.emailVerified && (me.mail
        ? <button className="btn ghost" style={{ justifySelf: "start" }} disabled={busy} onClick={() => run(() => api("/api/auth/verify", { method: "POST" }), "E-mail de confirmation envoyé.")}>Renvoyer l’e-mail de confirmation</button>
        : <p className="muted small" style={{ margin: 0 }}>L’envoi d’e-mails n’est pas encore activé sur le site.</p>)}
    </section>
  );
}

/** Accord pour enregistrer les zones douloureuses (données de santé). */
function HealthCard({ me, refresh, toast }: P) {
  const { busy, err, run } = useSubmit(toast);
  return (
    <section className="card">
      <div className="card-head"><h2>Données de santé</h2><span className={`chip ${me.settings.healthConsent ? "ok" : "dim"}`}><span className="dot" />{me.settings.healthConsent ? "Accord donné" : "Pas d’accord"}</span></div>
      <p className="soft" style={{ margin: 0 }}>Au check-in, tu peux indiquer où tu as mal (genou, mollet…) et noter ta FC au réveil et ta VFC, pour que l’X-Ray et la séance du lendemain en tiennent compte. Ces informations ne sont enregistrées qu’avec ton accord et ne sont jamais partagées.</p>
      {err && <p className="note err">{err}</p>}
      {me.settings.healthConsent
        ? <button className="btn danger" style={{ justifySelf: "start" }} disabled={busy} onClick={() => { if (confirm("Retirer ton accord ? Les zones douloureuses, FC au réveil et VFC déjà enregistrées seront effacées.")) run(async () => { await api("/api/health", { method: "DELETE" }); await refresh(); }, "Accord retiré, données effacées."); }}>Retirer mon accord et effacer</button>
        : <p className="muted small" style={{ margin: 0 }}>Tu pourras donner ton accord dans le check-in, au moment de signaler une douleur ou de noter tes mesures.</p>}
    </section>
  );
}
