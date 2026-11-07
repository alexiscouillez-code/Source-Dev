import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { dbConfigured, one, run } from "@/db/client";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "tp_session";
const SESSION_DAYS = 30;

export type User = { id: number; email: string; name: string | null };

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(password, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(key, expected);
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await run("INSERT INTO app_sessions(token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [sha256(token), userId, now + SESSION_DAYS * 86400000, now]);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await run("DELETE FROM app_sessions WHERE token_hash = ?", [sha256(token)]);
  jar.delete(COOKIE);
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !dbConfigured()) return null;
  return one<User>(
    "SELECT u.id, u.email, u.name FROM app_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    [sha256(token), Date.now()],
  );
}

export async function requireUser(returnTo = "/espace"): Promise<User> {
  const user = await getUser();
  if (!user) redirect(`/connexion?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
  return user;
}

export function safeReturnPath(value: string | null | undefined, fallback = "/espace") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
