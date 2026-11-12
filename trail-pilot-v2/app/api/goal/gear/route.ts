import { body, HttpError, json, withUser } from "@/lib/api";
import { run } from "@/db/client";

/** Matériel obligatoire (ou conseillé) de la course principale, à cocher la veille : [{ label, checked }]. */
export const PUT = withUser(async (user, req) => {
  const b = await body(req);
  if (!Array.isArray(b.items)) throw new HttpError(400, "Liste invalide.");
  const seen = new Set<string>();
  const items = b.items.slice(0, 40).flatMap((x: unknown) => {
    const o = x as { label?: unknown; checked?: unknown };
    const label = typeof o?.label === "string" ? o.label.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!label || seen.has(label.toLowerCase())) return [];
    seen.add(label.toLowerCase());
    return [{ label, checked: o.checked === true }];
  });
  const { changes } = await run("UPDATE goals SET gear = ? WHERE user_id = ?", [JSON.stringify(items), user.id]);
  if (!changes) throw new HttpError(400, "Choisis d’abord ta course.");
  return json({ items });
});
