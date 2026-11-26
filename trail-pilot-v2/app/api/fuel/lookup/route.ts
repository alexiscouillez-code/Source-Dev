import { HttpError, json, withUser } from "@/lib/api";
import { lookupBarcode } from "@/lib/fuel";

/** Code-barres → fiche produit (Open Food Facts), à vérifier avant de l'enregistrer. */
export const GET = withUser(async (_user, req) => {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const draft = await lookupBarcode(code);
  if (!draft) throw new HttpError(404, "Produit absent de la base Open Food Facts. Prends l’étiquette en photo ou saisis-le à la main.");
  return json({ draft });
});
