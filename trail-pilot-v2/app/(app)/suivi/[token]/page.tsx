import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addDays, todayIn } from "@/lib/engine/dates";
import { sharedView, userForShare, type SharedSession } from "@/lib/share";

/**
 * Planning partagé en lecture seule (coach, ami, club) : ouvert sans compte, par un lien secret révocable.
 * Aucun check-in, commentaire, donnée de santé ni détail de sortie n’y figure.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planning partagé", robots: { index: false, follow: false }, referrer: "no-referrer" };

const VERDICT: Record<string, { label: string; color: string }> = {
  solide: { label: "Objectif solide", color: "var(--ok)" }, ambitieux: { label: "Ambitieux mais jouable", color: "var(--lite)" },
  risque: { label: "Objectif risqué", color: "var(--danger)" }, court: { label: "Course très proche", color: "var(--rest)" },
};
const STATUS: Record<string, string> = { planned: "Prévue", adapted: "Adaptée", done: "Faite", skipped: "Sautée", missed: "Manquée" };
const QUALITY = new Set(["tempo", "hills", "climb", "downhill", "sharpen"]);
const kindOf = (t: string) => (t === "race" ? "race" : t === "strength" ? "renfo" : t === "recovery" ? "recup" : QUALITY.has(t) ? "qual" : "endu");
const dur = (m: number) => { const r = Math.round(m); return r >= 60 ? `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, "0")}` : `${r} min`; };
const short = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(Math.round(m % 60)).padStart(2, "0") : ""}` : `${Math.round(m)}′`);
const day = (iso: string, o: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { ...o, timeZone: "UTC" });
const num = (n: number) => Math.round(n).toLocaleString("fr-FR");

export default async function Suivi({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await userForShare(token);
  if (!userId) notFound();
  const today = todayIn("Europe/Paris");
  const v = await sharedView(userId, today);
  const byDay = new Map<string, SharedSession[]>();
  for (const s of v.sessions) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const weeks: string[][] = [];
  for (let d = v.from; d <= v.to; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  const next = v.sessions.filter((s) => s.date >= today && s.template !== "race" && s.status !== "skipped").slice(0, 7);
  const vd = v.plan ? VERDICT[v.plan.verdict] : null;

  return (
    <main className="share-page">
      <header className="share-head">
        <span className="eyebrow">Planning partagé · Trail Pilot</span>
        <h1>Le plan de {v.firstName}</h1>
        <p className="muted small" style={{ margin: 0 }}>Lecture seule. Mis à jour en continu : ce que tu vois est le plan du jour.</p>
      </header>

      {v.goal && (
        <section className="card race" style={vd ? { ["--accent" as string]: vd.color } : undefined}>
          <span className="eyebrow">Objectif · {day(v.goal.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          <h2 className="race-name" style={{ margin: "4px 0 0" }}>{v.goal.name}</h2>
          <div className="specs">
            <div><b>J-{v.goal.daysTo}</b><small>Compte à rebours</small></div>
            {v.goal.distanceKm != null && <div><b>{String(v.goal.distanceKm).replace(".", ",")} km</b><small>Distance</small></div>}
            {v.goal.gainM != null && <div><b>{num(v.goal.gainM)} m</b><small>D+</small></div>}
            {v.plan && <div><b>{dur(v.plan.estimate.low)} – {dur(v.plan.estimate.high)}</b><small>Temps estimé</small></div>}
          </div>
          {vd && v.plan && (
            <div className="race-verdict">
              <span className="chip" style={{ color: vd.color, borderColor: `color-mix(in srgb, ${vd.color} 45%, transparent)`, justifySelf: "start" }}><span className="dot" />{vd.label}</span>
              <p>{v.plan.headline}</p>
            </div>
          )}
          {v.regularity && <p className="muted small" style={{ margin: 0 }}>Régularité sur 4 semaines : {v.regularity.done} séance{v.regularity.done > 1 ? "s" : ""} faite{v.regularity.done > 1 ? "s" : ""} sur {v.regularity.planned} prévue{v.regularity.planned > 1 ? "s" : ""}.</p>}
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>Calendrier</h2><span className="chip dim">Semaine passée et 4 à venir</span></div>
        <div className="cal-grid" role="table" aria-label="Séances prévues">
          <div className="cal-row cal-head" role="row">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((w) => <span key={w} role="columnheader">{w}</span>)}<span className="cal-sum" role="columnheader">Semaine</span></div>
          {weeks.map((w) => {
            const ss = w.flatMap((d) => byDay.get(d) ?? []).filter((s) => s.template !== "race" && s.status !== "skipped");
            return (
              <div className="cal-row" role="row" key={w[0]}>
                {w.map((d) => (
                  <div key={d} role="cell" className={`cal-day ${d === today ? "today" : ""} ${d < today ? "past" : ""}`} aria-label={`${day(d)} : ${(byDay.get(d) ?? []).map((s) => `${s.title}, ${dur(s.duration)}, ${STATUS[s.status] ?? s.status}`).join(" ; ") || "repos"}`}>
                    <span className="cal-num">{Number(d.slice(8))}{(byDay.get(d) ?? []).some((s) => s.template === "race") && <i className="cal-flag" aria-hidden="true">⚑</i>}</span>
                    <span className="cal-evs" aria-hidden="true">
                      {(byDay.get(d) ?? []).filter((s) => s.template !== "race").map((s, i) => (
                        <span key={i} className={`ev ev-${kindOf(s.template)} st-${s.status}`}>{s.status === "done" && <b>✓</b>}<em>{s.title}</em><small>{short(s.duration)}</small></span>
                      ))}
                    </span>
                  </div>
                ))}
                <span className="cal-sum" role="cell">{ss.length > 0 && <><b>{dur(ss.reduce((t, s) => t + s.duration, 0))}</b><small>prévu</small></>}</span>
              </div>
            );
          })}
        </div>
        <div className="cal-legend" aria-hidden="true">
          {[["endu", "Endurance"], ["qual", "Qualité"], ["renfo", "Renforcement"], ["recup", "Récupération"]].map(([k, l]) => <span key={k}><i className={`ev-${k}`} />{l}</span>)}
          <span><b>✓</b> Faite</span>
        </div>
      </section>

      {next.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Prochaines séances</h2></div>
          <ul className="share-list">
            {next.map((s, i) => (
              <li key={i} className={`ev-${kindOf(s.template)}-b`}>
                <div className="row between"><b>{s.title}</b><span className="chip dim">{STATUS[s.status] ?? s.status}</span></div>
                <small className="muted">{day(s.date)} · {dur(s.duration)}{s.gain ? ` · ${num(s.gain)} m D+` : ""} · effort {s.rpe}/10</small>
                <p className="soft small" style={{ margin: 0 }}>{s.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {v.strategy && (
        <section className="card">
          <div className="card-head"><h2>Stratégie de course</h2><span className="chip">{dur(v.strategy.total.low)} – {dur(v.strategy.total.high)}</span></div>
          <div className="db-sections" role="table" aria-label="Temps de passage">
            <div className="db-row db-head" role="row"><span role="columnheader">Point</span><span role="columnheader">Km</span><span role="columnheader">Passage</span><span role="columnheader">Barrière</span></div>
            {v.strategy.sections.map((s, i) => (
              <div className="db-row" role="row" key={i}>
                <span role="cell"><b>{s.label}</b><small>+{num(s.gain)} / −{num(s.loss)} m</small></span>
                <span role="cell" className="mono">{String(s.to).replace(".", ",")}</span>
                <span role="cell" className="mono">{dur(s.low)}–{dur(s.high)}{s.clock && <small>{s.clock}</small>}</span>
                <span role="cell" className="mono">{s.cutoff ? <>{dur(s.cutoff)}{s.margin != null && <small className={s.margin < 0 ? "t-lent" : ""}>{s.margin < 0 ? "serré" : `marge ${dur(s.margin)}`}</small>}</> : "—"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {v.sides.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Courses de préparation</h2></div>
          <ul className="share-list">{v.sides.map((s, i) => <li key={i}><b>⚑ {s.name}</b><small className="muted">{day(s.date)}{s.distanceKm ? ` · ${String(s.distanceKm).replace(".", ",")} km` : ""}{s.gainM ? ` · ${num(s.gainM)} m D+` : ""} · {s.priority === "B" ? "objectif secondaire" : "course d’entraînement"}</small></li>)}</ul>
        </section>
      )}

      <p className="muted small share-foot">Le détail des sorties, le check-in du matin et les données de santé ne sont pas partagés. Planning généré par Trail Pilot.</p>
    </main>
  );
}
