import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { all, one, run } from "@/db/client";
import { open, seal } from "./crypto";
import { addDays } from "./engine/dates";
import { SITE_URL } from "./site";

/**
 * Abonnement agenda (iCalendar) : un lien secret, propre à chaque compte, que Google Agenda,
 * Apple Calendrier ou Outlook relisent régulièrement. Seule l’empreinte sert à retrouver le compte ;
 * le lien lui-même est gardé chiffré pour pouvoir le réafficher.
 */
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const urlOf = (token: string) => `${SITE_URL}/cal/${token}.ics`;

export async function calendarUrl(userId: number) {
  const row = await one<{ value: string }>("SELECT value FROM app_kv WHERE key = ?", [`cal:${userId}`]);
  try { return row ? urlOf(open(row.value)) : null; } catch { return null; }
}

export async function rotateCalendar(userId: number) {
  const token = randomBytes(24).toString("base64url");
  await run("INSERT INTO profiles(user_id, updated_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING", [userId, Date.now()]);
  await run("UPDATE profiles SET calendar_token = ? WHERE user_id = ?", [sha256(token), userId]);
  await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES (?, ?, ?)", [`cal:${userId}`, seal(token), Date.now()]);
  return urlOf(token);
}

export async function revokeCalendar(userId: number) {
  await run("UPDATE profiles SET calendar_token = NULL WHERE user_id = ?", [userId]);
  await run("DELETE FROM app_kv WHERE key = ?", [`cal:${userId}`]);
}

export async function userForCalendar(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const r = await one<{ user_id: number }>("SELECT user_id FROM profiles WHERE calendar_token = ?", [sha256(token)]);
  return r?.user_id ?? null;
}

// ---------- Format iCalendar (RFC 5545) ----------
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lignes de 75 octets au plus, repliées avec une espace. */
function fold(line: string) {
  const out: string[] = []; let cur = "", bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const ymd = (iso: string) => iso.replace(/-/g, "");
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);

export async function buildIcs(userId: number, today: string) {
  const rows = await all<{ id: number; date: string; title: string; duration_min: number; gain_m: number | null; rpe_target: number; description: string; phase: string; status: string; template: string; updated_at: number }>(
    "SELECT id, date, title, duration_min, gain_m, rpe_target, description, phase, status, template, updated_at FROM plan_sessions WHERE user_id = ? AND date >= ? AND date <= ? AND status != 'skipped' ORDER BY date",
    [userId, addDays(today, -14), addDays(today, 400)]);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const host = new URL(SITE_URL).host;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Trail Pilot//Plan d'entrainement//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Trail Pilot", "X-WR-CALDESC:Ton plan d'entraînement Trail Pilot", "X-WR-TIMEZONE:Europe/Paris",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H",
  ];
  for (const r of rows) {
    const race = r.template === "race";
    const summary = race ? `⚑ ${r.title}` : `${r.title} · ${dur(r.duration_min)}${r.gain_m ? ` · ${r.gain_m} m D+` : ""}`;
    const desc = `${race ? "" : `Effort ${r.rpe_target}/10 · ${r.phase}${r.status === "adapted" ? " · adaptée après ton check-in" : ""}\n\n`}${r.description}\n\nOuvrir dans Trail Pilot : ${SITE_URL}/espace#plan`;
    const mod = new Date(r.updated_at).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    lines.push(
      "BEGIN:VEVENT", `UID:tp-${r.id}@${host}`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${mod}`,
      `DTSTART;VALUE=DATE:${ymd(r.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(r.date, 1))}`,
      `SUMMARY:${esc(summary)}`, `DESCRIPTION:${esc(desc)}`, "TRANSP:TRANSPARENT",
      `CATEGORIES:${race ? "Course" : "Entraînement"}`, `STATUS:${r.status === "done" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
