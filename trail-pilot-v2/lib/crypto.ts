import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secret() {
  const s = process.env.AUTH_SECRET ?? process.env.STRAVA_CLIENT_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET manquant");
    return "dev-secret-trail-pilot";
  }
  return s;
}
const key = () => createHash("sha256").update(`enc:${secret()}`).digest();

/** Chiffrement AES-256-GCM des jetons stockés en base. */
export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
export function open(sealed: string) {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1") throw new Error("Format de jeton inconnu");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}

export function sign(value: string) {
  return createHmac("sha256", `sig:${secret()}`).update(value).digest("base64url");
}
export function verify(value: string, signature: string) {
  const a = Buffer.from(sign(value)), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
