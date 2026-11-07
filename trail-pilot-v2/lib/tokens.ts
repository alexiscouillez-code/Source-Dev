import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { one, run } from "@/db/client";

export type TokenKind = "reset" | "verify";
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Jeton à usage unique : seule son empreinte est stockée, les précédents du même type sont annulés. */
export async function createToken(userId: number, kind: TokenKind, ttlMinutes: number) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await run("DELETE FROM app_tokens WHERE user_id = ? AND kind = ?", [userId, kind]);
  await run("INSERT INTO app_tokens(token_hash, user_id, kind, expires_at, created_at) VALUES (?, ?, ?, ?, ?)", [sha256(token), userId, kind, now + ttlMinutes * 60000, now]);
  return token;
}

/** Vérifie et consomme le jeton. Renvoie l’utilisateur, ou null si le jeton est invalide ou expiré. */
export async function consumeToken(token: string, kind: TokenKind) {
  if (!token || token.length > 100) return null;
  const row = await one<{ user_id: number; expires_at: number }>("SELECT user_id, expires_at FROM app_tokens WHERE token_hash = ? AND kind = ?", [sha256(token), kind]);
  if (!row) return null;
  await run("DELETE FROM app_tokens WHERE token_hash = ?", [sha256(token)]);
  return row.expires_at > Date.now() ? row.user_id : null;
}

/** Dernier envoi d’un jeton de ce type (pour limiter les renvois). */
export async function lastTokenAt(userId: number, kind: TokenKind) {
  const r = await one<{ created_at: number }>("SELECT created_at FROM app_tokens WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1", [userId, kind]);
  return r?.created_at ?? 0;
}
