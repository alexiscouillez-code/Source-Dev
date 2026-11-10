"use client";

/** Date locale de l’appareil au format AAAA-MM-JJ. */
export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const today = localToday();
  const url = path + (init.method && init.method !== "GET" ? "" : `${path.includes("?") ? "&" : "?"}today=${today}`);
  let res: Response;
  try {
  res = await fetch(url, {
    method: init.method ?? "GET",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify({ today, ...(init.body as object) }) : init.method && init.method !== "GET" ? JSON.stringify({ today }) : undefined,
  });
  } catch {
    throw new ApiError(0, navigator.onLine ? "Le serveur ne répond pas. Réessaie dans un instant." : "Pas de connexion : réessaie quand tu auras du réseau.");
  }
  // Réponse servie par le mode hors ligne : on prévient l’interface de la date des données.
  const saved = Number(res.headers.get("X-TP-Saved") ?? 0);
  if (!init.method || init.method === "GET") window.dispatchEvent(new CustomEvent("tp-data", { detail: saved && !navigator.onLine ? saved : 0 }));
  if (res.status === 401) { navigator.serviceWorker?.controller?.postMessage("clear-private"); }
  if (res.status === 401) { window.location.assign("/connexion?return_to=/espace"); throw new ApiError(401, "Session expirée"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "Une erreur est survenue.");
  return data as T;
}

/** Séance transmise à l’onglet Terrains (« Où la faire ? »). */
export const PRESET_KEY = "tp-terrain-preset";

export const SPORT_LABEL: Record<string, string> = { trail: "Trail", course: "Course", rando: "Randonnée", velo: "Vélo", renfo: "Renforcement", autre: "Autre" };
export const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export const fmtDur = (m: number) => {
  const r = Math.round(m);
  return r >= 60 ? `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, "0")}` : `${r} min`;
};
export const fmtKm = (km: number | null | undefined) => (km == null ? "—" : km.toFixed(km < 10 ? 1 : 0).replace(".", ","));
export const fmtNum = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("fr-FR"));
export const dayLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", opts);
export const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
export const dayNum = (iso: string) => Number(iso.slice(8, 10));

export type Verdict = "ok" | "lite" | "rest";
export const VERDICT = {
  ok: { label: "OK", color: "var(--ok)", line: "Feu vert pour la séance prévue." },
  lite: { label: "Allège", color: "var(--lite)", line: "On sort, mais sans intensité." },
  rest: { label: "Récup", color: "var(--rest)", line: "Le repos fait partie de l’entraînement." },
} as const;

export interface PlanSession { id: number; date: string; template: string; title: string; sport: string; duration_min: number; gain_m: number | null; rpe_target: number; description: string; phase: string; status: string; activity_id: number | null; locked: number; original: string | null; a_duration?: number | null; a_distance?: number | null; a_gain?: number | null; a_name?: string | null; review?: Review | null }
export interface Review { dur: number; gain: number | null; inZone: number | null; above: number | null; below: number | null; verdict: "tenue" | "courte" | "longue" | "intense" | "facile"; label: string }
export interface Absence { kind: "malade" | "blesse" | "deplacement"; start: string; end: string }
export interface Activity { id: number; date: string; sport: string; name: string | null; duration_min: number; distance_km: number | null; gain_m: number | null; loss_m: number | null; avg_hr: number | null; rpe: number | null; source: string; load: number; effort: number; effortSource: "ressenti" | "zones" | "fc" | "estimé"; insight?: { zones: number[] | null; gap: number | null; dec: number | null; vo2: number | null } | null; track?: string | null; shoe_id?: number | null }
export interface Targets {
  vdot: number | null; method: "reserve" | "max" | null;
  paces: { key: "E" | "M" | "T" | "I"; label: string; use: string; fast: number; slow: number }[];
  zones: { z: 1 | 2 | 3 | 4 | 5; label: string; low: number; high: number }[];
}
export interface Me {
  user: { name: string | null; email: string; emailVerified: boolean };
  mail: boolean; push: boolean; onboarding: boolean;
  settings: { reminder: boolean; healthConsent: boolean };
  targets: Targets;
  strava: { configured: boolean; connected: boolean; athleteName: string | null; lastSyncAt: number | null; lastError: string | null; analyzed?: { done: number; total: number } | null };
  today: string;
  profile: { hr_max: number | null; hr_rest: number | null; vo2_watch: number | null; days_per_week: number; long_day: number; max_weekly_minutes: number | null; level: "debutant" | "regulier" | "confirme" };
  goal: { name: string; date: string; distance_km: number | null; gain_m: number | null; daysToGoal: number | null; phase: string } | null;
  load: { atl: number; ctl: number; form: number; ratio: number | null; monotony: number | null; load7: number; calibrated: boolean; historyDays: number };
  checkin: { sleep: number; legs: number; motivation: number; pain: 0 | 1 | 2; note: string | null; pain_zones?: string | null; sleep_h?: number | null; rhr?: number | null; hrv?: number | null } | null;
  decision: { verdict: Verdict; score: number; reasons: string[] } | null;
  todayPlan: PlanSession | null; tomorrowPlan: PlanSession | null; upcoming: PlanSession[]; needsPlan: boolean;
  recent: Activity[];
}
