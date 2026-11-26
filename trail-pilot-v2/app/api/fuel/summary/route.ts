import { json, withUser } from "@/lib/api";
import { fuelSummary } from "@/lib/fuel";

/** Ce qui a été testé à l'entraînement (meilleur apport passé sans souci, produits qui passent) : repère du plan de course. */
export const GET = withUser(async (user) => json(await fuelSummary(user.id)));
