import { body, HttpError, json, withUser } from "@/lib/api";
import { run } from "@/db/client";
import { addDays, diffDays } from "@/lib/engine/dates";
import { loadAbsence, regeneratePlan, resolveToday, type AbsenceKind } from "@/lib/service";

const KINDS: AbsenceKind[] = ["malade", "blesse", "deplacement"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Mode imprévu : déclarer une période de maladie, de blessure ou de déplacement, puis recalculer le plan. */
export const GET = withUser(async (user, req) => json({ absence: await loadAbsence(user.id, resolveToday(new URL(req.url).searchParams.get("today"))) }));

export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const today = resolveToday(typeof b.today === "string" ? b.today : null);
  const kind = KINDS.find((k) => k === b.kind);
  const start = typeof b.start === "string" && DAY.test(b.start) ? b.start : null, end = typeof b.end === "string" && DAY.test(b.end) ? b.end : null;
  if (!kind || !start || !end) throw new HttpError(400, "Indique le motif et les dates.");
  if (end < start) throw new HttpError(400, "La date de fin est avant la date de début.");
  if (start < addDays(today, -30) || diffDays(start, end) > 90) throw new HttpError(400, "Période trop longue ou trop ancienne (90 jours au plus).");
  await run(`INSERT INTO absences(user_id, kind, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET kind = excluded.kind, start_date = excluded.start_date, end_date = excluded.end_date, created_at = excluded.created_at`, [user.id, kind, start, end, Date.now()]);
  // Séances déjà passées ou du jour comprises dans la période : marquées « sautées » plutôt que « manquées ».
  if (kind !== "deplacement") await run("UPDATE plan_sessions SET status = 'skipped', updated_at = ? WHERE user_id = ? AND date BETWEEN ? AND ? AND date <= ? AND status IN ('planned', 'adapted', 'missed') AND template != 'race'", [Date.now(), user.id, start, end, today]);
  await regeneratePlan(user.id, today);
  return json({ ok: true });
});

export const DELETE = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  await run("DELETE FROM absences WHERE user_id = ?", [user.id]);
  await regeneratePlan(user.id, today);
  return json({ ok: true });
});
