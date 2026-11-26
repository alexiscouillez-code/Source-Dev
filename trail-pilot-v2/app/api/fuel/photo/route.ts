import { body, json, withUser } from "@/lib/api";
import { checkImage, readLabel, readPlate } from "@/lib/fuel";
import { resolveToday } from "@/lib/service";

/**
 * Photo lue par l'IA puis oubliée (rien n'est enregistré) :
 *  - « label » : étiquette d'un produit de ravitaillement → fiche à vérifier ;
 *  - « plate » : assiette → proportions estimées et retour par rapport à l'assiette du jour.
 */
export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const image = checkImage(b.image);
  if (b.mode === "plate") return json(await readPlate(user.id, image, resolveToday(typeof b.today === "string" ? b.today : null)));
  return json({ draft: await readLabel(user.id, image) });
});
