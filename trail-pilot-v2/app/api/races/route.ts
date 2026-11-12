import { body, HttpError, isoDate, json, num, text, withUser } from "@/lib/api";
import { all, one, run } from "@/db/client";
import { diffDays } from "@/lib/engine/dates";
import { MAX_PLAN_DAYS } from "@/lib/engine/planner";
import { loadSideRaces, regeneratePlan, resolveToday, setSideRacePlace, sideRaceGuides } from "@/lib/service";

/** Courses de préparation (objectifs secondaires ou courses d’entraînement). */
export const GET = withUser(async (user, req) => {
  const q = new URL(req.url).searchParams;
  // ?guides=1 : météo annoncée, temps visé et consignes pour chaque course à venir.
  if (q.get("guides") === "1") return json({ guides: await sideRaceGuides(user.id, resolveToday(q.get("today"))) });
  return json({ races: await loadSideRaces(user.id) });
});

/** Lieu de départ d’une course de préparation (pour sa météo), ou { clear: true } pour revenir au lieu d’entraînement. */
export const PATCH = withUser(async (user, req) => {
  const b = await body(req);
  const id = Number(b.id);
  if (!Number.isInteger(id)) throw new HttpError(400, "Course inconnue.");
  let place = null;
  if (b.clear !== true) {
    const lat = Number(b.lat), lon = Number(b.lon), name = text(b.name, 120);
    if (!name || !(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) throw new HttpError(400, "Lieu invalide.");
    place = { name, lat, lon };
  }
  if (!(await setSideRacePlace(user.id, id, place))) throw new HttpError(404, "Course inconnue.");
  return json({ ok: true });
});

export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  const name = text(b.name, 80);
  if (!name) throw new HttpError(400, "Donne un nom à la course.");
  const date = isoDate(b.date, "Date de course");
  if (date <= today) throw new HttpError(400, "La course doit être dans le futur.");
  if (diffDays(today, date) > MAX_PLAN_DAYS) throw new HttpError(400, "Choisis une course dans les 13 prochains mois.");
  const priority = b.priority === "C" ? "C" : "B";
  const main = await one<{ date: string }>("SELECT date FROM goals WHERE user_id = ?", [user.id]);
  if (main) {
    const gap = diffDays(date, main.date);
    if (gap === 0) throw new HttpError(400, "C’est la date de ta course principale.");
    if (gap > 0 && gap < 14) throw new HttpError(400, "Trop proche de ta course principale : garde au moins deux semaines entre les deux pour arriver frais.");
  }
  const existing = await all<{ date: string }>("SELECT date FROM side_races WHERE user_id = ? AND date >= ?", [user.id, today]);
  if (existing.length >= 8) throw new HttpError(400, "8 courses de préparation au plus.");
  if (existing.some((e) => Math.abs(diffDays(e.date, date)) < 3)) throw new HttpError(400, "Une autre course de préparation est prévue à moins de 3 jours.");
  await run("INSERT INTO side_races(user_id, name, date, distance_km, gain_m, priority, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [user.id, name, date, num(b.distanceKm, 1, 400, "Distance", true), num(b.gainM, 0, 15000, "D+", true), priority, Date.now()]);
  await regeneratePlan(user.id, today);
  return json({ ok: true }, 201);
});

export const DELETE = withUser(async (user, req) => {
  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id)) throw new HttpError(400, "Course inconnue.");
  const { changes } = await run("DELETE FROM side_races WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!changes) throw new HttpError(404, "Course inconnue.");
  await regeneratePlan(user.id, resolveToday(url.searchParams.get("today")));
  return json({ ok: true });
});
