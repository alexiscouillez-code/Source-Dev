import { json, withUser } from "@/lib/api";
import { one } from "@/db/client";
import { estimateVo2 } from "@/lib/engine/vo2";
import { trainingTargets } from "@/lib/engine/paces";
import { mailConfigured } from "@/lib/mail";
import { dashboard, loadActivities, resolveToday } from "@/lib/service";
import { stravaStatus } from "@/lib/strava";

export const GET = withUser(async (user, req) => {
  const today = resolveToday(new URL(req.url).searchParams.get("today"));
  const [data, strava, extra, history] = await Promise.all([
    dashboard(user.id, today),
    stravaStatus(user.id),
    one<{ email_verified_at: number | null; reminder: number | null; onboarded_at: number | null; health_consent_at: number | null; acts: number }>(
      `SELECT u.email_verified_at, p.reminder, p.onboarded_at, p.health_consent_at,
        (SELECT COUNT(*) FROM activities a WHERE a.user_id = u.id) AS acts
       FROM app_users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`, [user.id]),
    loadActivities(user.id, "0000-01-01"),
  ]);
  const p = data.profile;
  const vo2 = estimateVo2(
    history.map((r) => ({ date: r.date, sport: r.sport, durationMin: r.duration_min, distanceKm: r.distance_km, gainM: r.gain_m, avgHr: r.avg_hr, maxHr: r.max_hr, name: r.name })),
    today, { hrMax: p.hr_max, hrRest: p.hr_rest },
  );
  return json({
    user: { name: user.name, email: user.email, emailVerified: !!extra?.email_verified_at },
    mail: mailConfigured(),
    push: !!process.env.VAPID_PUBLIC_KEY,
    settings: { reminder: !!extra?.reminder, healthConsent: !!extra?.health_consent_at },
    onboarding: !extra?.onboarded_at && !data.goal && !strava.connected && !(extra?.acts ?? 0),
    targets: trainingTargets(vo2.method === "seances" ? vo2.value : null, vo2.hrMax, p.hr_rest),
    strava, ...data,
  });
});
