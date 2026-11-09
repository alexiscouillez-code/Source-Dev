"use client";

import { useEffect, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum } from "./client";
import type { WeekSummary } from "@/lib/week";

const DAY1 = ["L", "M", "M", "J", "V", "S", "D"];
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

/** Bilan de la semaine : affiché du dimanche au mardi sur « Aujourd’hui », avec une image à partager en story. */
export default function WeekCard({ today, toast }: { today: string; toast: (m: string) => void }) {
  const [w, setW] = useState<WeekSummary | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const wd = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lundi
  const show = wd === 6 || wd <= 1;
  useEffect(() => {
    if (!show) return;
    try { if (localStorage.getItem("tp-week-hide") === today) { setHidden(true); return; } } catch { /* rien */ }
    api<WeekSummary>("/api/week").then(setW).catch(() => setW(null));
  }, [show, today]);
  if (!show || hidden || !w || (w.totals.count === 0 && w.plan.planned === 0)) return null;
  const maxDay = Math.max(30, ...w.days.map((d) => d.minutes));
  const delta = pct(w.totals.minutes, w.previous.minutes);
  const range = `${dayLabel(w.monday, { day: "numeric" })} – ${dayLabel(w.sunday, { day: "numeric", month: "long" })}`;

  async function share() {
    setBusy(true);
    try {
      const blob = await storyImage(w!, range);
      const file = new File([blob], `trail-pilot-semaine-${w!.monday}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: "Ma semaine Trail Pilot" }).catch(() => {});
      else {
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast("Image téléchargée : ajoute-la à ta story depuis ta galerie.");
      }
    } catch { toast("Impossible de créer l’image pour le moment."); }
    finally { setBusy(false); }
  }

  return (
    <section className="card week-card" style={{ marginTop: 14 }} aria-labelledby="week-title">
      <div className="card-head">
        <div><span className="eyebrow">{w.isCurrent ? "Ta semaine" : "La semaine dernière"} · {range}</span><h2 id="week-title" style={{ marginTop: 4 }}>Bilan de la semaine</h2></div>
        <button className="link small" onClick={() => { try { localStorage.setItem("tp-week-hide", today); } catch { /* rien */ } setHidden(true); }}>Masquer</button>
      </div>
      <div className="week-kpis">
        <div><b className="num-up">{fmtKm(w.totals.km)}</b><small>km</small></div>
        <div><b className="num-up">{fmtNum(w.totals.gain)}</b><small>m D+</small></div>
        <div><b>{fmtDur(w.totals.minutes)}</b><small>{delta != null ? `${delta > 0 ? "+" : ""}${delta} % vs sem. préc.` : "d’activité"}</small></div>
        {w.plan.planned > 0
          ? <div><b className="num-up">{w.plan.done}</b><small>sur {w.plan.planned} séances</small></div>
          : <div><b className="num-up">{w.totals.count}</b><small>sortie{w.totals.count > 1 ? "s" : ""}</small></div>}
      </div>
      <div className="week-bars" role="img" aria-label="Minutes d’activité par jour">
        {w.days.map((d, i) => (
          <div key={d.date} className={d.date === today ? "on" : ""}>
            <i style={{ ["--h" as string]: `${(d.minutes / maxDay) * 100}%`, ["--d" as string]: `${i * 60}ms` }} />
            <small>{DAY1[i]}</small>
          </div>
        ))}
      </div>
      <ul className="reasons small" style={{ margin: 0 }}>
        {w.best && <li>Plus longue sortie : {w.best.name ?? "sortie"} · {fmtDur(w.best.minutes)}{w.best.km ? `, ${fmtKm(w.best.km)} km` : ""}{w.best.gain ? `, ${fmtNum(w.best.gain)} m D+` : ""}.</li>}
        <li>Fraîcheur {w.form > 0 ? "+" : ""}{fmtNum(w.form)} : {w.form >= 5 ? "tu as de la réserve." : w.form <= -15 ? "fatigue marquée, soigne la récupération." : "charge bien absorbée."}</li>
        {w.next.sessions > 0 && <li>Semaine prochaine : {w.next.sessions} séances, {fmtDur(w.next.minutes)}{w.next.gain ? `, ${fmtNum(w.next.gain)} m D+` : ""}{w.next.key ? ` — temps fort : ${w.next.key.title} (${dayLabel(w.next.key.date, { weekday: "long" })})` : ""}.</li>}
      </ul>
      <button className="btn ghost sm" style={{ justifySelf: "start" }} onClick={share} disabled={busy}>{busy ? "Création…" : "Partager en story"}</button>
    </section>
  );
}

/** Image 1080 × 1920 au format story (Instagram, WhatsApp…). */
async function storyImage(w: WeekSummary, range: string): Promise<Blob> {
  const W = 1080, H = 1920, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0b0f14"); bg.addColorStop(1, "#1b2631");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.85, H * 0.12, 0, W * 0.85, H * 0.12, 700); glow.addColorStop(0, "rgba(255,106,43,.38)"); glow.addColorStop(1, "rgba(255,106,43,0)");
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  // Ligne de crête stylisée
  g.strokeStyle = "rgba(255,106,43,.9)"; g.lineWidth = 6; g.lineJoin = "round"; g.beginPath();
  const ridge = [0, 1380, 140, 1330, 260, 1350, 380, 1250, 470, 1280, 590, 1160, 700, 1210, 820, 1120, 930, 1170, 1080, 1090];
  for (let i = 0; i < ridge.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, ridge[i], ridge[i + 1]);
  g.stroke();
  g.fillStyle = "#f4efe6";
  g.font = `600 34px ${font}`; g.letterSpacing = "8px"; g.fillText("TRAIL PILOT", 90, 160);
  g.letterSpacing = "0px";
  g.fillStyle = "#ff6a2b"; g.font = `600 30px ${font}`; g.fillText(w.isCurrent ? "MA SEMAINE" : "MA SEMAINE DERNIÈRE", 90, 260);
  g.fillStyle = "#a9b4be"; g.font = `500 40px ${font}`; g.fillText(range, 90, 320);
  const big = (v: string, unit: string, y: number, size = 210) => {
    g.fillStyle = "#f4efe6"; g.font = `700 ${size}px ${font}`; g.fillText(v, 84, y);
    const wv = g.measureText(v).width;
    g.fillStyle = "#a9b4be"; g.font = `500 56px ${font}`; g.fillText(unit, 84 + wv + 22, y);
  };
  big(fmtKm(w.totals.km), "km", 560);
  big(fmtNum(w.totals.gain), "m D+", 760, 150);
  big(fmtDur(w.totals.minutes), "", 930, 120);
  g.fillStyle = "#a9b4be"; g.font = `500 44px ${font}`;
  g.fillText(`${w.totals.count} sortie${w.totals.count > 1 ? "s" : ""}${w.plan.planned ? ` · ${w.plan.done}/${w.plan.planned} séances du plan` : ""}`, 90, 1020);
  // Barres par jour
  const maxDay = Math.max(30, ...w.days.map((d) => d.minutes)), bw = 92, gap = 40, x0 = 90, yBase = 1520, hMax = 300;
  w.days.forEach((d, i) => {
    const h = Math.max(8, (d.minutes / maxDay) * hMax), x = x0 + i * (bw + gap);
    g.fillStyle = d.minutes ? "#ff6a2b" : "rgba(244,239,230,.16)";
    g.beginPath(); g.roundRect(x, yBase - h, bw, h, 16); g.fill();
    g.fillStyle = "#a9b4be"; g.font = `600 36px ${font}`; g.textAlign = "center"; g.fillText(DAY1[i], x + bw / 2, yBase + 60); g.textAlign = "left";
  });
  if (w.best) { g.fillStyle = "#f4efe6"; g.font = `500 42px ${font}`; g.fillText(`Plus longue : ${fmtDur(w.best.minutes)}${w.best.gain ? ` · ${fmtNum(w.best.gain)} m D+` : ""}`, 90, 1700); }
  if (w.goal?.daysToGoal != null && w.goal.daysToGoal > 0) { g.fillStyle = "#ff6a2b"; g.font = `600 42px ${font}`; g.fillText(`J-${w.goal.daysToGoal} · ${w.goal.name}`.slice(0, 40), 90, 1770); }
  g.fillStyle = "rgba(244,239,230,.5)"; g.font = `500 30px ${font}`; g.fillText("trail-pilot-v2.vercel.app", 90, 1850);
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("image"))), "image/png"));
}
