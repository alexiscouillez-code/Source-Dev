import { body, HttpError, json, withUser } from "@/lib/api";
import { one, run } from "@/db/client";
import { regeneratePlan, resolveToday } from "@/lib/service";
import { cleanPolyline } from "@/lib/polyline";

const MAX_POINTS = 3000;

/** Course visée : l'active (goals), ou une course principale suivante (?race=<id>). */
function target(req: Request, userId: number) {
  const id = Number(new URL(req.url).searchParams.get("race"));
  return Number.isInteger(id) && id > 0
    ? { next: true, table: "next_goals", where: "id = ? AND user_id = ?", args: [id, userId] as (number | string)[] }
    : { next: false, table: "goals", where: "user_id = ?", args: [userId] as (number | string)[] };
}

function cleanAid(v: unknown, dist: number) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).flatMap((a) => {
    const km = Number((a as { km?: unknown })?.km);
    const name = String((a as { name?: unknown })?.name ?? "").trim().slice(0, 40);
    const c = Number((a as { cutoff?: unknown })?.cutoff);
    const cutoff = Number.isFinite(c) && c > 0 && c <= 10000 ? Math.round(c) : null;
    return Number.isFinite(km) && km > 0 && km < dist ? [{ km: Math.round(km * 10) / 10, name, cutoff }] : [];
  }).sort((a, b) => a.km - b.km);
}

/** Enregistre le tracé de la course (profil simplifié) et ses ravitaillements. */
export const PUT = withUser(async (user, req) => {
  const b = await body<{ points?: unknown; aid?: unknown; distanceKm?: unknown; gainM?: unknown; lossM?: unknown; line?: unknown; updateGoal?: unknown; today?: string }>(req);
  const t = target(req, user.id);
  const goal = await one<{ distance_km: number | null; gain_m: number | null; route: string | null }>(`SELECT distance_km, gain_m, route FROM ${t.table} WHERE ${t.where}`, t.args);
  if (!goal) throw new HttpError(400, "Choisis d’abord ta course.");
  if (!Array.isArray(b.points) || b.points.length < 2 || b.points.length > MAX_POINTS) throw new HttpError(400, "Tracé invalide.");
  const points: [number, number][] = [];
  for (const p of b.points) {
    const k = Number((p as unknown[])?.[0]), e = Number((p as unknown[])?.[1]);
    if (!Number.isFinite(k) || !Number.isFinite(e) || k < 0 || k > 400 || e < -500 || e > 9000) throw new HttpError(400, "Tracé invalide.");
    points.push([Math.round(k * 1000) / 1000, Math.round(e)]);
  }
  const distanceKm = Math.round(Number(b.distanceKm) * 10) / 10, gainM = Math.round(Number(b.gainM)), lossM = Math.round(Number(b.lossM));
  if (!(distanceKm > 0 && distanceKm <= 400) || !(gainM >= 0 && gainM <= 15000) || !(lossM >= 0 && lossM <= 15000)) throw new HttpError(400, "Tracé invalide.");
  const route = { points, aid: cleanAid(b.aid, distanceKm), distanceKm, gainM, lossM, line: cleanPolyline(b.line, 40000), uploadedAt: Date.now(),
    // Heure de départ et barrière d’arrivée sont gardées quand on change de tracé.
    ...(() => { try { const o = goal.route ? JSON.parse(goal.route) : null; return { startTime: o?.startTime ?? null, finishCutoff: o?.finishCutoff ?? null }; } catch { return {}; } })() };
  await run(`UPDATE ${t.table} SET route = ? WHERE ${t.where}`, [JSON.stringify(route), ...t.args]);
  // Course suivante : distance et D+ suivent le tracé, sans recalcul (le plan vise la course active).
  if (t.next) {
    if (b.updateGoal !== false) await run(`UPDATE next_goals SET distance_km = ?, gain_m = ? WHERE ${t.where}`, [distanceKm, gainM, ...t.args]);
    return json({ ok: true, replanned: false });
  }
  // Le tracé fait foi : distance et D+ de la course sont mis à jour et le plan recalculé.
  if (b.updateGoal !== false && (goal.distance_km !== distanceKm || goal.gain_m !== gainM)) {
    await run("UPDATE goals SET distance_km = ?, gain_m = ?, plan_meta = NULL, updated_at = ? WHERE user_id = ?", [distanceKm, gainM, Date.now(), user.id]);
    await regeneratePlan(user.id, resolveToday(typeof b.today === "string" ? b.today : null));
    return json({ ok: true, replanned: true });
  }
  return json({ ok: true, replanned: false });
});

/** Modifie les ravitaillements (et leurs barrières), l’heure de départ et la barrière d’arrivée. */
export const PATCH = withUser(async (user, req) => {
  const b = await body<{ aid?: unknown; startTime?: unknown; finishCutoff?: unknown }>(req);
  const t = target(req, user.id);
  const row = await one<{ route: string | null }>(`SELECT route FROM ${t.table} WHERE ${t.where}`, t.args);
  if (!row?.route) throw new HttpError(400, "Importe d’abord le tracé de ta course.");
  const route = JSON.parse(row.route);
  if (b.aid !== undefined) route.aid = cleanAid(b.aid, route.distanceKm);
  if (b.startTime !== undefined) route.startTime = typeof b.startTime === "string" && /^([01]?\d|2[0-3]):[0-5]\d$/.test(b.startTime) ? b.startTime : null;
  if (b.finishCutoff !== undefined) { const f = Number(b.finishCutoff); route.finishCutoff = Number.isFinite(f) && f > 0 && f <= 10000 ? Math.round(f) : null; }
  await run(`UPDATE ${t.table} SET route = ? WHERE ${t.where}`, [JSON.stringify(route), ...t.args]);
  return json({ ok: true });
});

export const DELETE = withUser(async (user, req) => {
  const t = target(req, user.id);
  await run(`UPDATE ${t.table} SET route = NULL WHERE ${t.where}`, t.args);
  return json({ ok: true });
});
