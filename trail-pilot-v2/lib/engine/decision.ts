import { diffDays } from "./dates";

export type Verdict = "ok" | "lite" | "rest";
export interface Watch { sleepH?: number | null; rhr?: number | null; hrv?: number | null; base?: { rhr: number | null; hrv: number | null; nRhr: number; nHrv: number } }
export interface CheckIn { sleep: number; legs: number; motivation: number; pain: 0 | 1 | 2; zones?: string[]; watch?: Watch }

const DESCENT_ZONES = ["quads", "knees", "shins"], CLIMB_ZONES = ["calves", "ankles", "glutes"];
export interface LoadState { ratio: number | null; form: number; ctl: number; calibrated: boolean }
export interface PlannedLike { title: string; durationMin: number; rpeTarget: number; template: string; sport: string; description: string; gainM: number | null }

export const VERDICT_LABEL: Record<Verdict, string> = { ok: "OK", lite: "Allège", rest: "Récup" };
const fmtH = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;

/** Référence personnelle : médiane des mesures des 14 jours précédents (au moins 4). */
export function watchBaseline(rows: { rhr: number | null; hrv: number | null }[]) {
  const med = (v: number[]) => { if (v.length < 4) return null; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const r = rows.map((x) => x.rhr).filter((x): x is number => x != null), h = rows.map((x) => x.hrv).filter((x): x is number => x != null);
  return { rhr: med(r), hrv: med(h), nRhr: r.length, nHrv: h.length };
}

/**
 * Décision du jour (check-in du matin). Règles, dans l’ordre :
 *  1. douleur marquée → récup, toujours ;
 *  2. score de forme ressentie 0-100 (sommeil, jambes, motivation) ;
 *  3. corrections par la charge : ratio fatigue/forme > 1,5 (−25), > 1,3 (−12), < 0,8 (+5) ;
 *     fraîcheur très négative (< −30 % de la forme de fond) (−10) ;
 *  4. mesures de la montre, si tu les donnes : moins de 6 h de sommeil (−8, −15 sous 5 h),
 *     FC au réveil au-dessus de ta référence (+5 bpm : −7, +8 bpm : −15),
 *     VFC sous ta référence (−10 % : −7, −20 % : −15) ; référence = médiane de tes 14 derniers jours ;
 *  5. seuils : ≥ 62 OK, ≥ 42 allège, sinon récup.
 */
export function decide(c: CheckIn, load: LoadState, today: string, goalDate?: string | null) {
  const reasons: string[] = [];
  if (c.pain === 2) {
    return { verdict: "rest" as Verdict, score: 0, reasons: ["Douleur marquée signalée : on ne s’entraîne pas sur une douleur."] };
  }
  let score = ((c.sleep + c.legs + c.motivation - 3) / 12) * 100;
  if (c.sleep <= 2) reasons.push("Nuit courte ou agitée.");
  if (c.legs <= 2) reasons.push("Jambes lourdes.");
  if (c.motivation <= 2) reasons.push("Motivation en berne.");
  if (c.sleep >= 4 && c.legs >= 4) reasons.push("Bien reposé, jambes fraîches.");
  if (c.pain === 1) {
    score -= 15;
    const z = c.zones ?? [];
    if (z.some((x) => DESCENT_ZONES.includes(x))) reasons.push("Gêne aux cuisses, genoux ou tibias : évite les descentes rapides aujourd’hui.");
    else if (z.some((x) => CLIMB_ZONES.includes(x))) reasons.push("Gêne aux mollets, chevilles ou fessiers : pas de côtes ni de terrain technique aujourd’hui.");
    else reasons.push("Petite gêne : on reste prudent.");
    if (z.length) reasons.push("Si la gêne revient deux jours de suite, fais-la examiner.");
  }

  const w = c.watch;
  if (w) {
    if (w.sleepH != null) {
      if (w.sleepH < 5) { score -= 15; reasons.push(`Moins de 5 h de sommeil (${fmtH(w.sleepH)}).`); }
      else if (w.sleepH < 6) { score -= 8; reasons.push(`Nuit courte (${fmtH(w.sleepH)}).`); }
      else if (w.sleepH >= 8) reasons.push(`Bonne nuit (${fmtH(w.sleepH)}).`);
    }
    const b = w.base;
    if (w.rhr != null && b?.rhr != null) {
      const dr = Math.round(w.rhr - b.rhr);
      if (dr >= 8) { score -= 15; reasons.push(`FC au réveil nettement haute : ${w.rhr} bpm, ${dr} de plus que ta référence (${Math.round(b.rhr)}). Signe de fatigue, de stress ou d’un virus qui couve.`); }
      else if (dr >= 5) { score -= 7; reasons.push(`FC au réveil un peu haute : +${dr} bpm par rapport à ta référence.`); }
      else if (dr <= 1) reasons.push("FC au réveil normale.");
    } else if (w.rhr != null && b) reasons.push(`FC au réveil notée : encore ${Math.max(1, 4 - b.nRhr)} mesure(s) pour avoir ta référence.`);
    if (w.hrv != null && b?.hrv != null) {
      const r = w.hrv / b.hrv;
      if (r <= 0.8) { score -= 15; reasons.push(`VFC basse : ${w.hrv} ms, ${Math.round((1 - r) * 100)} % sous ta référence. Le corps n’a pas récupéré.`); }
      else if (r <= 0.9) { score -= 7; reasons.push(`VFC un peu basse (${Math.round((1 - r) * 100)} % sous ta référence).`); }
      else if (r >= 1.05) { score += 3; reasons.push("VFC au-dessus de ta référence : bonne récupération."); }
    } else if (w.hrv != null && b) reasons.push(`VFC notée : encore ${Math.max(1, 4 - b.nHrv)} mesure(s) pour avoir ta référence.`);
  }

  if (load.ratio != null && load.calibrated) {
    const r = load.ratio, f = (n: number) => n.toFixed(2).replace(".", ",");
    if (r > 1.5) { score -= 25; reasons.push(`Fatigue très au-dessus de ta forme de fond (ratio ${f(r)}).`); }
    else if (r > 1.3) { score -= 12; reasons.push(`Semaines plus chargées que d’habitude (ratio ${f(r)}).`); }
    else if (r < 0.8) { score += 5; reasons.push("Charge récente légère : tu as de la marge."); }
    else reasons.push("Charge cohérente avec ta forme de fond.");
    if (load.ctl > 0 && load.form < -0.3 * load.ctl) { score -= 10; reasons.push("Fraîcheur basse : la fatigue s’accumule."); }
  } else {
    reasons.push("Historique encore court : la décision s’appuie surtout sur ton ressenti.");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict: Verdict = score >= 62 ? "ok" : score >= 42 ? "lite" : "rest";
  if (goalDate) {
    const d = diffDays(today, goalDate);
    if (d >= 1 && d <= 10 && verdict === "ok") reasons.push(`J-${d} : affûtage, on garde du jus pour le jour J.`);
  }
  return { verdict, score, reasons };
}

/** Version de la séance prévue adaptée au verdict. */
export function adapt(p: PlannedLike, v: Verdict): PlannedLike {
  if (v === "ok" || p.template === "rest" || p.template === "race") return p;
  if (v === "lite") {
    return {
      ...p,
      title: p.rpeTarget > 4 ? "Endurance facile (allégée)" : `${p.title} (allégée)`,
      durationMin: Math.max(20, Math.round((p.durationMin * 0.7) / 5) * 5),
      rpeTarget: Math.min(p.rpeTarget, 3),
      gainM: p.gainM ? Math.round((p.gainM * 0.5) / 50) * 50 : p.gainM,
      template: "easy",
      description: "Séance allégée suite au check-in : allure conversation, aucune intensité, 30 % de volume en moins. Si les sensations reviennent bonnes en route, n’en rajoute pas.",
    };
  }
  return {
    ...p, title: "Repos actif", sport: "autre", template: "recovery", durationMin: 20, rpeTarget: 1, gainM: null,
    description: "Récupération : 20 minutes de marche ou de mobilité douce, hydratation, coucher tôt. La séance prévue saute : on ne la rattrape pas.",
  };
}
