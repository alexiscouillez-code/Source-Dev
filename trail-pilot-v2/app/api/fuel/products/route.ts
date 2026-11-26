import { body, HttpError, json, withUser } from "@/lib/api";
import { addProduct, listProducts, removeProduct } from "@/lib/fuel";

/** Produits de ravitaillement du coureur (gels, barres, boissons…). */
export const GET = withUser(async (user) => json({ products: await listProducts(user.id) }));

export const POST = withUser(async (user, req) => {
  const b = await body(req);
  const source = b.source === "code" || b.source === "photo" ? b.source : "manuel";
  return json({ product: await addProduct(user.id, b.product, source) });
});

export const DELETE = withUser(async (user, req) => {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Produit inconnu.");
  await removeProduct(user.id, id);
  return json({ ok: true });
});
