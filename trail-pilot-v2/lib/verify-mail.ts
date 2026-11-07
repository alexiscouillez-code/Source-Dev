import "server-only";
import { mailConfigured, sendMail } from "./mail";
import { createToken } from "./tokens";
import { logError } from "./errors";
import { SITE_URL } from "./site";

/** Envoie le lien de confirmation d’adresse (valable 7 jours). Ne lève jamais d’erreur. */
export async function sendVerification(userId: number, email: string) {
  if (!mailConfigured()) return false;
  try {
    const token = await createToken(userId, "verify", 7 * 24 * 60);
    await sendMail(email, "Confirme ton adresse e-mail",
      "Bienvenue sur Trail Pilot ! Confirme ton adresse pour pouvoir récupérer ton compte si tu oublies ton mot de passe.",
      { label: "Confirmer mon adresse", url: `${SITE_URL}/api/auth/verify?token=${token}` },
      "Ce lien est valable 7 jours. Si tu n’as pas créé de compte, ignore cet e-mail.");
    return true;
  } catch (e) {
    await logError("mail", e, { url: "verify", userId });
    return false;
  }
}
