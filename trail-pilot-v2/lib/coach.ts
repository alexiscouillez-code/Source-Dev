import "server-only";
import { all, one, run } from "@/db/client";
import { HttpError } from "./api";
import { addDays } from "./engine/dates";
import { estimateVo2 } from "./engine/vo2";
import { fmtPace, trainingTargets } from "./engine/paces";
import { dashboard, loadActivities, loadSideRaces, readPlanMeta, loadGoal } from "./service";

/**
 * Coach IA : répond aux questions d’entraînement en s’appuyant sur les données réelles du coureur
 * (plan, charge, check-in, séances récentes). Utilise l’API Anthropic ; inactif sans ANTHROPIC_API_KEY.
 */
export const coachConfigured = () => !!process.env.ANTHROPIC_API_KEY;
const MODEL = () => process.env.COACH_MODEL || "claude-sonnet-5-5";
export const DAILY_LIMIT = 30;

const SYSTEM = `Tu es le coach de Trail Pilot, une appli d’entraînement pour le trail, la course et la randonnée.
Tu parles français, tu tutoies, tu es chaleureux et direct. Réponds court : 2 à 6 phrases, ou une petite liste avec des tirets si c’est plus clair. Pas de titres, pas de tableau.

Tu reçois les données réelles du coureur dans <donnees>. Appuie-toi dessus et cite les chiffres utiles (séance prévue, charge, fraîcheur, check-in). N’invente aucune donnée : si une information manque, dis-le et explique comment l’ajouter dans l’appli.

Ce que fait l’appli, pour bien orienter : un check-in du soir (sommeil, jambes, motivation, douleur, mesures de la montre) adapte la séance du lendemain ; le plan se recalcule chaque lundi et via le bouton « Recalculer avec ma forme » dans Planning ; on peut marquer une séance faite ou sautée ; les courses de préparation s’ajoutent dans Planning ; la stratégie de course (temps de passage, nutrition) est dans Planning quand le GPX est importé. Tu ne modifies pas le plan toi-même : dis précisément quoi faire et où.

Principes : progression d’au plus 10 % par semaine, une semaine plus légère toutes les quatre, 80 % du volume en endurance facile, garder un jour facile entre deux séances dures, ne jamais rattraper une séance manquée en doublant la suivante.

Santé : tu n’es pas médecin. Pas de diagnostic, pas de médicament ni de dosage. Douleur qui dure plus de deux ou trois jours, qui s’aggrave, qui fait boiter ou qui réveille la nuit, douleur thoracique, malaise ou essoufflement inhabituel : recommande clairement de consulter un professionnel de santé et de ne pas courir en attendant.

Hors sujet (autre que sport, récupération, nutrition sportive, matériel, organisation de l’entraînement) : réponds en une phrase que tu es là pour l’entraînement.`;

const h = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;

async function context(userId: number, today: string) {
  const [d, history, goal, sides] = await Promise.all([dashboard(userId, today), loadActivities(userId, "0000-01-01"), loadGoal(userId), loadSideRaces(userId)]);
  const p = d.profile;
  const vo2 = estimateVo2(history.map((r) => ({ date: r.date, sport: r.sport, durationMin: r.duration_min, distanceKm: r.distance_km, gainM: r.gain_m, avgHr: r.avg_hr, maxHr: r.max_hr })), today, { hrMax: p.hr_max, hrRest: p.hr_rest });
  const t = trainingTargets(vo2.method === "seances" ? vo2.value : null, vo2.hrMax, p.hr_rest);
  const meta = goal && goal.date > today ? readPlanMeta(goal) : null;
  const next = await all<{ date: string; title: string; duration_min: number; gain_m: number | null; rpe_target: number; status: string }>(
    "SELECT date, title, duration_min, gain_m, rpe_target, status FROM plan_sessions WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date", [userId, today, addDays(today, 14)]);
  const recent = history.filter((a) => a.date >= addDays(today, -21));
  return {
    aujourdhui: today,
    profil: { niveau: p.level, seances_par_semaine: p.days_per_week, temps_max_semaine: p.max_weekly_minutes ? h(p.max_weekly_minutes) : null, fc_max: p.hr_max, fc_repos: p.hr_rest },
    course: goal ? { nom: goal.name, date: goal.date, distance_km: goal.distance_km, d_plus: goal.gain_m, jours_restants: d.goal?.daysToGoal, phase: d.goal?.phase } : null,
    plan: meta ? { verdict: meta.verdict, resume: meta.headline, temps_estime: `${h(meta.estimate.low)} à ${h(meta.estimate.high)}`, conseille: { volume_semaine: h(meta.demands.weeklyMin), sortie_longue: h(meta.demands.longMin), d_plus_semaine: meta.demands.weeklyGain }, atteint_par_le_plan: { volume_semaine: h(meta.reach.weeklyMin), sortie_longue: h(meta.reach.longMin) }, pourquoi: meta.diagnosis?.causes ?? [], leviers: meta.diagnosis?.fixes ?? [] } : null,
    courses_de_preparation: sides.filter((s) => s.date >= today).map((s) => ({ nom: s.name, date: s.date, km: s.distanceKm, d_plus: s.gainM, importance: s.priority === "B" ? "objectif secondaire" : "entraînement" })),
    charge: { forme_de_fond: d.load.ctl, fatigue: d.load.atl, fraicheur: d.load.form, ratio_7j_6sem: d.load.ratio, calibre: d.load.calibrated },
    checkin_du_jour: d.checkin ? { sommeil_1a5: d.checkin.sleep, jambes_1a5: d.checkin.legs, motivation_1a5: d.checkin.motivation, douleur_0a2: d.checkin.pain, heures_de_sommeil: d.checkin.sleep_h, fc_reveil: d.checkin.rhr, vfc: d.checkin.hrv } : "pas encore fait",
    decision_pour_demain: d.decision ? { verdict: { ok: "OK", lite: "Allège", rest: "Récup" }[d.decision.verdict], raisons: d.decision.reasons } : null,
    prochaines_seances: next.map((s) => ({ date: s.date, seance: s.title, duree: h(s.duration_min), d_plus: s.gain_m, effort_sur_10: s.rpe_target, statut: s.status })),
    seances_3_dernieres_semaines: recent.slice(0, 25).map((a) => ({ date: a.date, sport: a.sport, nom: a.name, duree: h(a.duration_min), km: a.distance_km, d_plus: a.gain_m, fc_moy: a.avg_hr, ressenti_sur_10: a.rpe })),
    vo2max_estimee: vo2.value,
    allures: t.paces.map((x) => ({ type: x.label, allure: `${fmtPace(x.fast)} à ${fmtPace(x.slow)} /km` })),
    zones_fc: t.zones.map((z) => ({ zone: z.z, bpm: `${z.low}-${z.high}` })),
  };
}

export async function history(userId: number) {
  return (await all<{ role: "user" | "assistant"; content: string; at: number }>(
    "SELECT role, content, at FROM coach_messages WHERE user_id = ? ORDER BY at DESC, id DESC LIMIT 40", [userId])).reverse();
}

export async function ask(userId: number, today: string, message: string) {
  if (!coachConfigured()) throw new HttpError(503, "Le coach n’est pas encore activé sur le site.");
  const since = Date.now() - 86400000;
  const used = await one<{ n: number }>("SELECT COUNT(*) AS n FROM coach_messages WHERE user_id = ? AND role = 'user' AND at > ?", [userId, since]);
  if ((used?.n ?? 0) >= DAILY_LIMIT) throw new HttpError(429, `Tu as posé ${DAILY_LIMIT} questions en 24 h : reviens un peu plus tard.`);

  const past = (await history(userId)).slice(-12);
  const data = await context(userId, today);
  const messages = [
    ...past.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: `<donnees>\n${JSON.stringify(data)}\n</donnees>\n\n${message}` },
  ];
  // L’API exige d’alterner les rôles et de commencer par l’utilisateur.
  while (messages.length && messages[0].role !== "user") messages.shift();
  const merged = messages.reduce<typeof messages>((acc, m) => { const last = acc[acc.length - 1]; if (last && last.role === m.role) last.content += `\n\n${m.content}`; else acc.push({ ...m }); return acc; }, []);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL(), max_tokens: 900, system: SYSTEM, messages: merged }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    console.error("Coach IA", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new HttpError(502, res.status === 429 ? "Le coach est très demandé : réessaie dans une minute." : "Le coach ne répond pas pour le moment. Réessaie dans un instant.");
  }
  const j = (await res.json()) as { content?: { type: string; text?: string }[] };
  const reply = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  if (!reply) throw new HttpError(502, "Le coach n’a pas su répondre. Reformule ta question.");
  const now = Date.now();
  await run("INSERT INTO coach_messages(user_id, role, content, at) VALUES (?, 'user', ?, ?)", [userId, message, now]);
  await run("INSERT INTO coach_messages(user_id, role, content, at) VALUES (?, 'assistant', ?, ?)", [userId, reply.slice(0, 6000), now + 1]);
  return reply;
}
