import "server-only";
import { all, one, run } from "@/db/client";
import { open, seal, sign, verify } from "./crypto";
import type { Sport } from "./engine/load";
import { cleanPolyline, decodePolyline, encodePolyline, thin } from "./polyline";
import { analyze } from "./engine/streams";

const API = "https://www.strava.com/api/v3";
export const STRAVA_SCOPE = "read,activity:read_all";

export function stravaConfig() {
  const id = process.env.STRAVA_CLIENT_ID, secret = process.env.STRAVA_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

// ---------- OAuth ----------
export function createState(userId: number) {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(`strava:${payload}`)}`;
}
export function readState(state: string): number | null {
  const [uid, ts, sig] = state.split(".");
  if (!uid || !ts || !sig || !verify(`strava:${uid}.${ts}`, sig)) return null;
  if (Date.now() - Number(ts) > 15 * 60000) return null;
  return Number(uid);
}
export const webhookVerifyToken = () => sign("strava-webhook").slice(0, 24);

interface TokenResponse { access_token: string; refresh_token: string; expires_at: number; athlete?: { id: number; firstname?: string; lastname?: string } }

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const cfg = stravaConfig();
  if (!cfg) throw new Error("Strava n’est pas configuré");
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cfg.id, client_secret: cfg.secret, ...params }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new StravaError(res.status, "Échange de jeton Strava refusé");
  return res.json();
}

export class StravaError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function linkAccount(userId: number, code: string, scope: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code" });
  if (!t.athlete) throw new Error("Réponse Strava incomplète");
  const athleteId = String(t.athlete.id);
  // Un compte Strava ne peut être relié qu’à un seul compte Trail Pilot.
  await run("DELETE FROM strava_links WHERE athlete_id = ? AND user_id != ?", [athleteId, userId]);
  await run(
    `INSERT INTO strava_links(user_id, athlete_id, athlete_name, access_token, refresh_token, expires_at, scope, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET athlete_id = excluded.athlete_id, athlete_name = excluded.athlete_name,
       access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
       scope = excluded.scope, last_error = NULL`,
    [userId, athleteId, [t.athlete.firstname, t.athlete.lastname].filter(Boolean).join(" ") || null, seal(t.access_token), seal(t.refresh_token), t.expires_at, scope, Date.now()],
  );
}

interface Link { user_id: number; athlete_id: string; access_token: string; refresh_token: string; expires_at: number; last_sync_at: number | null }

async function accessToken(link: Link) {
  if (link.expires_at - 120 > Date.now() / 1000) return open(link.access_token);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: open(link.refresh_token) });
  await run("UPDATE strava_links SET access_token = ?, refresh_token = ?, expires_at = ? WHERE user_id = ?", [seal(t.access_token), seal(t.refresh_token), t.expires_at, link.user_id]);
  return t.access_token;
}

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (res.status === 429) throw new StravaError(429, "Limite d’appels Strava atteinte, réessaie dans 15 minutes.");
  if (res.status === 401) throw new StravaError(401, "Accès Strava révoqué. Reconnecte ton compte.");
  if (!res.ok) throw new StravaError(res.status, `Strava a répondu ${res.status}`);
  return res.json() as Promise<T>;
}

// ---------- Activités ----------
interface StravaActivity {
  id: number; name: string; sport_type?: string; type?: string; start_date: string; start_date_local: string;
  moving_time: number; elapsed_time: number; distance: number; total_elevation_gain: number;
  average_heartrate?: number; max_heartrate?: number; perceived_exertion?: number | null; manual?: boolean;
  map?: { polyline?: string | null; summary_polyline?: string | null };
}

/** Tracé Strava ramené à 500 points au plus. */
function trackOf(a: StravaActivity) {
  const raw = a.map?.polyline || a.map?.summary_polyline;
  if (!raw) return null;
  try { const pts = decodePolyline(raw); return pts.length >= 2 ? cleanPolyline(encodePolyline(thin(pts, 500))) : null; } catch { return null; }
}

export function mapSport(t = ""): Sport {
  if (t === "TrailRun") return "trail";
  if (/^(Run|VirtualRun)$/.test(t)) return "course";
  if (/^(Hike|Walk|Snowshoe)$/.test(t)) return "rando";
  if (/Ride$|^Velomobile$|^Handcycle$/.test(t)) return "velo";
  if (/^(WeightTraining|Workout|Crossfit|Yoga|Pilates|HighIntensityIntervalTraining|StairStepper)$/.test(t)) return "renfo";
  return "autre";
}

async function upsertActivity(userId: number, a: StravaActivity) {
  const sport = mapSport(a.sport_type ?? a.type);
  const minutes = Math.round(((a.moving_time || a.elapsed_time) / 60) * 10) / 10;
  if (minutes < 3) return;
  const now = Date.now();
  await run(
    `INSERT INTO activities(user_id, date, started_at, sport, name, duration_min, distance_km, gain_m, avg_hr, max_hr, rpe, source, strava_id, track, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'strava', ?, ?, ?, ?)
     ON CONFLICT(user_id, strava_id) WHERE strava_id IS NOT NULL DO UPDATE SET
       date = excluded.date, started_at = excluded.started_at, sport = excluded.sport, name = excluded.name,
       duration_min = excluded.duration_min, distance_km = excluded.distance_km, gain_m = excluded.gain_m,
       avg_hr = excluded.avg_hr, max_hr = excluded.max_hr, rpe = COALESCE(activities.rpe, excluded.rpe),
       track = COALESCE(excluded.track, activities.track), updated_at = excluded.updated_at`,
    [userId, a.start_date_local.slice(0, 10), a.start_date, sport, a.name?.slice(0, 120) ?? null, minutes,
      a.distance ? Math.round(a.distance / 10) / 100 : null, a.total_elevation_gain != null ? Math.round(a.total_elevation_gain) : null,
      a.average_heartrate ?? null, a.max_heartrate ?? null, a.perceived_exertion ?? null, String(a.id), trackOf(a), now, now],
  );
}

// ---------- Analyse seconde par seconde ----------
type StreamSet = Partial<Record<"time" | "heartrate" | "velocity_smooth" | "grade_smooth" | "altitude" | "distance", { data: number[] }>>;
export const AUTO_SYNC_GAP = 3 * 60000;
const STREAMS_PER_SYNC = 25; // Strava limite les appels : on rattrape l’historique par lots, des plus récentes aux plus anciennes

/** Télécharge les flux d’une activité, en tire le résumé d’analyse et l’enregistre. Renvoie false si la limite d’appels est atteinte. */
async function analyzeActivity(token: string, userId: number, stravaId: string) {
  let state = 2, json: string | null = null, loss: number | null = null;
  try {
    const s = await api<StreamSet>(token, `/activities/${stravaId}/streams?keys=time,heartrate,velocity_smooth,grade_smooth,altitude,distance&key_by_type=true`);
    if (s.time?.data?.length) {
      const a = analyze({ time: s.time.data, hr: s.heartrate?.data, speed: s.velocity_smooth?.data, grade: s.grade_smooth?.data, altitude: s.altitude?.data, distance: s.distance?.data });
      if (a) { state = 1; json = JSON.stringify(a); loss = a.loss; }
    }
  } catch (err) {
    if (err instanceof StravaError && (err.status === 429 || err.status === 401)) return false; // on réessaiera à la prochaine synchro
    if (!(err instanceof StravaError) || err.status !== 404) return true; // erreur passagère : l’activité reste à analyser
  }
  await run("UPDATE activities SET analysis = ?, stream_state = ?, loss_m = COALESCE(loss_m, ?) WHERE user_id = ? AND strava_id = ?", [json, state, loss, userId, stravaId]);
  return true;
}

/** Relit une sortie Strava déjà importée (par exemple pour obtenir ses temps de passage au kilomètre, utiles au débrief). */
export async function reanalyze(userId: number, stravaId: string) {
  const link = await one<Link>("SELECT * FROM strava_links WHERE user_id = ?", [userId]);
  if (!link) return false;
  try { return await analyzeActivity(await accessToken(link), userId, stravaId); } catch { return false; }
}

/** Analyse les sorties à pied avec cardio qui ne l’ont pas encore été (les plus récentes d’abord). */
async function analyzePending(token: string, userId: number, limit = STREAMS_PER_SYNC) {
  const rows = await all<{ strava_id: string }>(
    `SELECT strava_id FROM activities WHERE user_id = ? AND strava_id IS NOT NULL AND stream_state IS NULL AND avg_hr IS NOT NULL
       AND sport IN ('course', 'trail', 'rando') AND duration_min >= 15 ORDER BY date DESC LIMIT ?`, [userId, limit]);
  let done = 0;
  for (const r of rows) { if (!(await analyzeActivity(token, userId, r.strava_id))) break; done++; }
  return done;
}

/** Importe les activités depuis la dernière synchro (120 jours au premier passage). */
export async function syncUser(userId: number, opts: { auto?: boolean } = {}) {
  const link = await one<Link>("SELECT * FROM strava_links WHERE user_id = ?", [userId]);
  if (!link) throw new StravaError(404, "Aucun compte Strava relié.");
  // Synchro automatique (ouverture de l’appli, retour sur l’onglet, tâche du matin) : au plus une toutes les
  // 3 minutes par compte, pour rester sous les limites d’appels de Strava.
  if (opts.auto && link.last_sync_at && Date.now() - link.last_sync_at < AUTO_SYNC_GAP) return { imported: 0, added: 0, analyzed: 0, skipped: true };
  try {
    const token = await accessToken(link);
    // Une fois par compte, on repasse sur 120 jours pour récupérer les tracés GPS des sorties déjà importées.
    const backfilled = await one<{ value: string }>("SELECT value FROM app_kv WHERE key = ?", [`tracks:${userId}`]);
    const after = Math.floor((link.last_sync_at && backfilled ? link.last_sync_at - 3 * 86400000 : Date.now() - 120 * 86400000) / 1000);
    let imported = 0;
    const count = async () => (await one<{ n: number }>("SELECT COUNT(*) AS n FROM activities WHERE user_id = ? AND strava_id IS NOT NULL", [userId]))?.n ?? 0;
    const before = await count();
    for (let page = 1; page <= 8; page++) {
      const list = await api<StravaActivity[]>(token, `/athlete/activities?after=${after}&per_page=100&page=${page}`);
      for (const a of list) { await upsertActivity(userId, a); imported++; }
      if (list.length < 100) break;
    }
    await run("UPDATE strava_links SET last_sync_at = ?, last_error = NULL WHERE user_id = ?", [Date.now(), userId]);
    if (!backfilled) await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES (?, '1', ?)", [`tracks:${userId}`, Date.now()]);
    // L’analyse fine ne doit jamais faire échouer la synchro elle-même.
    const analyzed = await analyzePending(token, userId, opts.auto ? 8 : STREAMS_PER_SYNC).catch(() => 0);
    // `added` : sorties réellement nouvelles (la fenêtre de synchro repasse aussi sur les 3 derniers jours).
    return { imported, added: Math.max(0, (await count()) - before), analyzed, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur Strava";
    await run("UPDATE strava_links SET last_error = ? WHERE user_id = ?", [message, userId]);
    throw err;
  }
}

// ---------- Webhook ----------
export interface WebhookEvent { object_type: "activity" | "athlete"; object_id: number; aspect_type: "create" | "update" | "delete"; owner_id: number; updates?: Record<string, string> }

export async function handleWebhook(e: WebhookEvent) {
  const link = await one<Link>("SELECT * FROM strava_links WHERE athlete_id = ?", [String(e.owner_id)]);
  if (!link) return;
  if (e.object_type === "athlete" && e.updates?.authorized === "false") {
    await run("DELETE FROM strava_links WHERE user_id = ?", [link.user_id]);
    return;
  }
  if (e.object_type !== "activity") return;
  if (e.aspect_type === "delete") {
    await run("DELETE FROM activities WHERE user_id = ? AND strava_id = ?", [link.user_id, String(e.object_id)]);
    return;
  }
  const token = await accessToken(link);
  await upsertActivity(link.user_id, await api<StravaActivity>(token, `/activities/${e.object_id}`));
  // Nouvelle sortie : analysée dans la foulée, puis un petit lot de rattrapage de l’historique.
  await run("UPDATE activities SET stream_state = NULL WHERE user_id = ? AND strava_id = ? AND stream_state = 2", [link.user_id, String(e.object_id)]);
  await analyzePending(token, link.user_id, 6).catch(() => 0);
}

/** Crée l’abonnement webhook de l’application s’il n’existe pas encore (une fois pour toute l’app). */
export async function ensureWebhook(origin: string) {
  const cfg = stravaConfig();
  if (!cfg || origin.includes("localhost")) return;
  const known = await one<{ value: string }>("SELECT value FROM app_kv WHERE key = 'strava_webhook'");
  if (known) return;
  const q = new URLSearchParams({ client_id: cfg.id, client_secret: cfg.secret });
  const existing = await fetch(`${API}/push_subscriptions?${q}`, { signal: AbortSignal.timeout(10000) });
  const subs = existing.ok ? ((await existing.json()) as { id: number; callback_url: string }[]) : [];
  const callback = `${origin}/api/strava/webhook`;
  let id = subs.find((s) => s.callback_url === callback)?.id;
  if (!id && subs.length === 0) {
    const body = new URLSearchParams({ client_id: cfg.id, client_secret: cfg.secret, callback_url: callback, verify_token: webhookVerifyToken() });
    const res = await fetch(`${API}/push_subscriptions`, { method: "POST", body, signal: AbortSignal.timeout(15000) });
    if (res.ok) id = ((await res.json()) as { id: number }).id;
  }
  if (id) await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES ('strava_webhook', ?, ?)", [String(id), Date.now()]);
}

export async function unlink(userId: number) {
  const link = await one<Link>("SELECT * FROM strava_links WHERE user_id = ?", [userId]);
  if (!link) return;
  try {
    const token = await accessToken(link);
    await fetch("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  } catch { /* le lien est supprimé de notre côté quoi qu’il arrive */ }
  await run("DELETE FROM strava_links WHERE user_id = ?", [userId]);
}

export async function stravaStatus(userId: number) {
  const link = await one<{ athlete_name: string | null; last_sync_at: number | null; last_error: string | null }>(
    "SELECT athlete_name, last_sync_at, last_error FROM strava_links WHERE user_id = ?", [userId]);
  // Fraîcheur des données : combien de sorties à pied avec cardio sont analysées seconde par seconde.
  const c = link ? await one<{ total: number; done: number }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN stream_state = 1 THEN 1 ELSE 0 END) AS done FROM activities
      WHERE user_id = ? AND strava_id IS NOT NULL AND avg_hr IS NOT NULL AND sport IN ('course', 'trail', 'rando') AND duration_min >= 15`, [userId]) : null;
  return { configured: !!stravaConfig(), connected: !!link, athleteName: link?.athlete_name ?? null, lastSyncAt: link?.last_sync_at ?? null, lastError: link?.last_error ?? null,
    analyzed: c ? { done: c.done ?? 0, total: c.total ?? 0 } : null };
}
export { all };
