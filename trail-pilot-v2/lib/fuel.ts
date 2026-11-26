import "server-only";
import { all, one, run } from "@/db/client";
import { HttpError } from "./api";
import { aiVisionJson, visionConfigured } from "./ai";
import { addDays } from "./engine/dates";
import {
  cleanDraft, cleanPlate, compareIntake, DAY_LABEL, dayKind, fromOpenFoodFacts, intakeStats, PLATES, plateFeedback, recoveryFor, testedBest,
  type DayKind, type FuelProduct, type IntakeItem, type ProductDraft, type SessionLike,
} from "./engine/nutrition";

/**
 * Carburant : produits de ravitaillement du coureur, prises pendant les sorties, assiette du jour et récupération.
 * Les photos (étiquette, assiette) sont lues par l'IA puis oubliées : rien n'est gardé, ni l'image ni sa description.
 */

export interface ProductRow { id: number; name: string; brand: string | null; kind: string; carbs: number; sodium: number | null; caffeine: number | null; unit: string | null; barcode: string | null; source: string }

export const listProducts = (userId: number) =>
  all<ProductRow>("SELECT id, name, brand, kind, carbs, sodium, caffeine, unit, barcode, source FROM fuel_products WHERE user_id = ? AND archived = 0 ORDER BY kind, name", [userId]);

export async function addProduct(userId: number, raw: unknown, source: "manuel" | "code" | "photo"): Promise<ProductRow> {
  const d = cleanDraft(raw);
  if (!d) throw new HttpError(400, "Donne au moins un nom au produit.");
  if (d.carbs == null) throw new HttpError(400, "Indique les glucides par unité (un gel, une barre, une dose).");
  const n = await one<{ n: number }>("SELECT COUNT(*) AS n FROM fuel_products WHERE user_id = ? AND archived = 0", [userId]);
  if ((n?.n ?? 0) >= 60) throw new HttpError(400, "60 produits au plus : retire ceux que tu n’utilises plus.");
  // Même code-barres déjà enregistré : on met la fiche à jour plutôt que de la doubler.
  const same = d.barcode ? await one<{ id: number }>("SELECT id FROM fuel_products WHERE user_id = ? AND barcode = ? AND archived = 0", [userId, d.barcode]) : null;
  if (same) {
    await run("UPDATE fuel_products SET name = ?, brand = ?, kind = ?, carbs = ?, sodium = ?, caffeine = ?, unit = ? WHERE id = ?", [d.name, d.brand, d.kind, d.carbs, d.sodium, d.caffeine, d.unit, same.id]);
    return (await one<ProductRow>("SELECT id, name, brand, kind, carbs, sodium, caffeine, unit, barcode, source FROM fuel_products WHERE id = ?", [same.id]))!;
  }
  const r = await run("INSERT INTO fuel_products(user_id, name, brand, kind, carbs, sodium, caffeine, unit, barcode, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, d.name, d.brand, d.kind, d.carbs, d.sodium, d.caffeine, d.unit, d.barcode, source, Date.now()]);
  return (await one<ProductRow>("SELECT id, name, brand, kind, carbs, sodium, caffeine, unit, barcode, source FROM fuel_products WHERE id = ?", [r.id]))!;
}

export async function removeProduct(userId: number, id: number) {
  // Archivé, pas effacé : les sorties où il a été pris gardent leur détail.
  await run("UPDATE fuel_products SET archived = 1 WHERE id = ? AND user_id = ?", [id, userId]);
}

// ---------- Code-barres (Open Food Facts, base libre et gratuite) ----------
const OFF_FIELDS = "product_name,product_name_fr,brands,quantity,serving_size,serving_quantity,nutriments";
export async function lookupBarcode(code: string): Promise<ProductDraft | null> {
  const c = code.replace(/\D/g, "");
  if (c.length < 8 || c.length > 14) throw new HttpError(400, "Code-barres invalide (8 à 14 chiffres).");
  const key = `off:${c}`;
  const cached = await one<{ value: string; updated_at: number }>("SELECT value, updated_at FROM app_kv WHERE key = ?", [key]);
  if (cached && Date.now() - cached.updated_at < 30 * 86400000) return cached.value === "null" ? null : JSON.parse(cached.value);
  try {
    const base = process.env.OFF_BASE || "https://world.openfoodfacts.org";
    const res = await fetch(`${base}/api/v2/product/${c}.json?fields=${OFF_FIELDS}`, {
      headers: { "user-agent": "TrailPilot/2.0 (https://trail-pilot-v2.vercel.app)" }, signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) { await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES (?, 'null', ?)", [key, Date.now()]); return null; }
    if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
    const j = (await res.json()) as { status?: number; product?: Record<string, unknown> };
    const d = j.status === 1 ? fromOpenFoodFacts(c, j.product) : null;
    await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES (?, ?, ?)", [key, JSON.stringify(d), Date.now()]);
    return d;
  } catch (e) {
    console.error("Open Food Facts", e instanceof Error ? e.message : e);
    if (cached) return cached.value === "null" ? null : JSON.parse(cached.value);
    throw new HttpError(502, "La base des produits ne répond pas. Réessaie, ou saisis le produit à la main.");
  }
}

// ---------- Photos ----------
const PHOTO_PER_DAY = 30;
async function photoQuota(userId: number) {
  if (!visionConfigured()) throw new HttpError(503, "La lecture de photo n’est pas disponible pour le moment. Saisis le produit à la main.");
  const key = `photo:${userId}:${new Date().toISOString().slice(0, 10)}`;
  const row = await one<{ value: string }>("SELECT value FROM app_kv WHERE key = ?", [key]);
  const n = Number(row?.value ?? 0);
  if (n >= PHOTO_PER_DAY) throw new HttpError(429, `${PHOTO_PER_DAY} photos par jour au plus : réessaie demain.`);
  await run("INSERT OR REPLACE INTO app_kv(key, value, updated_at) VALUES (?, ?, ?)", [key, String(n + 1), Date.now()]);
}
export function checkImage(v: unknown): string {
  if (typeof v !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(v)) throw new HttpError(400, "Photo invalide.");
  if (v.length > 2_500_000) throw new HttpError(413, "Photo trop lourde.");
  return v;
}

const LABEL_SYSTEM = "Tu lis l’étiquette d’un produit de ravitaillement pour le sport d’endurance (gel, barre, boisson, compote, pâte de fruits). Tu réponds uniquement par un objet JSON, sans texte autour.";
const LABEL_PROMPT = `Lis l’étiquette et réponds avec ce JSON :
{"name": "nom du produit et parfum", "brand": "marque ou null", "kind": "gel|barre|boisson|compote|pate|solide|autre",
 "carbs": glucides en grammes pour UNE unité consommée (un gel, une barre, une dose de boisson préparée), "sodium": sodium en mg par unité ou null,
 "caffeine": caféine en mg par unité ou null, "unit": "ce qu’est une unité, par ex. gel 40 g, barre 50 g, dose 500 ml",
 "barcode": "chiffres du code-barres s’ils sont lisibles, sinon null"}
Si l’étiquette ne donne que des valeurs pour 100 g ou 100 ml, calcule-les pour l’unité avec le poids net ou la portion indiquée.
Si tu lis du sel et pas du sodium, sodium = sel × 400. Si la photo ne montre pas un produit alimentaire, réponds {"error": "pas de produit"}.`;

/** Photo d'étiquette → fiche produit à vérifier. Si un code-barres est lisible, la base Open Food Facts complète la lecture. */
export async function readLabel(userId: number, image: string): Promise<ProductDraft> {
  await photoQuota(userId);
  const raw = await aiVisionJson(LABEL_SYSTEM, LABEL_PROMPT, image);
  if (!raw || raw.error) throw new HttpError(422, "Je n’arrive pas à lire cette étiquette. Prends la face des valeurs nutritionnelles, bien à plat et nette, ou saisis le produit à la main.");
  const d = cleanDraft(raw);
  if (!d) throw new HttpError(422, "Étiquette illisible : saisis le produit à la main.");
  if (d.barcode) {
    const off = await lookupBarcode(d.barcode).catch(() => null);
    if (off) return { ...off, carbs: off.carbs ?? d.carbs, sodium: off.sodium ?? d.sodium, caffeine: off.caffeine ?? d.caffeine, unit: off.unit ?? d.unit };
  }
  return d;
}

const PLATE_SYSTEM = "Tu estimes à l’œil la composition d’une assiette pour un coureur. Tu ne donnes jamais de calories ni de poids. Tu réponds uniquement par un objet JSON, sans texte autour.";
const PLATE_PROMPT = `Estime la part de la surface de l’assiette occupée par chaque famille, en pourcentages :
{"feculents": pâtes, riz, pommes de terre, pain, semoule, céréales, légumineuses, "legumes": légumes et fruits, "proteines": viande, poisson, œufs, tofu, produits laitiers,
 "foods": ["3 à 6 aliments reconnus, en français, quelques mots chacun"]}
Les sauces et matières grasses ne comptent pas. Si la photo ne montre pas de nourriture, réponds {"error": "pas d’assiette"}.`;

export async function readPlate(userId: number, image: string, today: string) {
  await photoQuota(userId);
  const raw = await aiVisionJson(PLATE_SYSTEM, PLATE_PROMPT, image);
  const read = raw && !raw.error ? cleanPlate(raw) : null;
  if (!read) throw new HttpError(422, "Je ne reconnais pas d’assiette sur cette photo. Prends-la d’au-dessus, en entier.");
  const day = await fuelDay(userId, today);
  return { read, target: PLATES[day.kind], kind: day.kind, label: DAY_LABEL[day.kind], ...plateFeedback(read, day.kind) };
}

// ---------- Journée : assiette et récupération ----------
interface DaySession extends SessionLike { activity_id: number | null }

/** Assiette du jour et, après une grosse séance aujourd'hui, de quoi récupérer. */
export async function fuelDay(userId: number, today: string, effortOf?: (activityId: number) => number | null) {
  const [sessions, acts] = await Promise.all([
    all<DaySession & { date: string; duration_min: number }>("SELECT date, template, duration_min, sport, status, activity_id FROM plan_sessions WHERE user_id = ? AND date IN (?, ?) AND template <> 'strength' ORDER BY duration_min DESC", [userId, today, addDays(today, 1)]),
    all<{ id: number; duration_min: number; sport: string; rpe: number | null }>("SELECT id, duration_min, sport, rpe FROM activities WHERE user_id = ? AND date = ? AND COALESCE(check_state, 0) <> 1 AND sport <> 'renfo' ORDER BY duration_min DESC", [userId, today]),
  ]);
  const mk = (s: (typeof sessions)[number] | undefined): DaySession | null => (s ? { template: s.template, durationMin: s.duration_min, sport: s.sport, status: s.status, activity_id: s.activity_id } : null);
  const t = mk(sessions.find((s) => s.date === today)), tm = mk(sessions.find((s) => s.date !== today));
  const doneMin = acts.reduce((m, a) => Math.max(m, a.duration_min), 0);
  const { kind, reason } = dayKind({ today: t, doneMin, tomorrow: tm });
  const big = acts[0];
  const linked = big ? sessions.find((s) => s.activity_id === big.id) : undefined;
  const recovery = big ? recoveryFor({ durationMin: big.duration_min, template: linked?.template ?? null, effort: big.rpe ?? effortOf?.(big.id) ?? null, tomorrow: tm }) : null;
  return { kind, label: DAY_LABEL[kind], reason, plate: PLATES[kind], recovery };
}
export type FuelDay = Awaited<ReturnType<typeof fuelDay>>;
export type { DayKind };

// ---------- Prises pendant une sortie ----------
const targetOf = (description: string | null | undefined) => { const m = /(\d+) g de glucides par heure/.exec(description ?? ""); return m ? Number(m[1]) : null; };

/** Durée de la sortie du jour : celle qui a validé la séance, sinon la plus longue. */
async function minutesOn(userId: number, date: string): Promise<number | null> {
  const linked = await one<{ d: number }>("SELECT a.duration_min AS d FROM plan_sessions p JOIN activities a ON a.id = p.activity_id WHERE p.user_id = ? AND p.date = ? ORDER BY a.duration_min DESC LIMIT 1", [userId, date]);
  if (linked) return linked.d;
  const any = await one<{ d: number }>("SELECT MAX(duration_min) AS d FROM activities WHERE user_id = ? AND date = ? AND COALESCE(check_state, 0) <> 1", [userId, date]);
  return any?.d ?? null;
}

export async function intakeFor(userId: number, date: string) {
  const [row, plan, minutes] = await Promise.all([
    one<{ items: string; carbs: number; minutes: number | null; g_per_hour: number | null; target: number | null }>("SELECT items, carbs, minutes, g_per_hour, target FROM fuel_intakes WHERE user_id = ? AND date = ?", [userId, date]),
    one<{ description: string }>("SELECT description FROM plan_sessions WHERE user_id = ? AND date = ? AND template IN ('long', 'b2b', 'test') ORDER BY id LIMIT 1", [userId, date]),
    minutesOn(userId, date),
  ]);
  const target = targetOf(plan?.description) ?? row?.target ?? null;
  const items = row ? (JSON.parse(row.items) as { productId: number; name: string; carbs: number; qty: number }[]) : [];
  const gph = row?.g_per_hour ?? null;
  return { date, items, carbs: row?.carbs ?? 0, minutes: minutes ?? row?.minutes ?? null, gPerHour: gph, target, compare: compareIntake(gph, target) };
}

export async function saveIntake(userId: number, date: string, raw: unknown) {
  if (!Array.isArray(raw)) throw new HttpError(400, "Liste des prises invalide.");
  const items: IntakeItem[] = raw.slice(0, 30).map((x) => ({ productId: Number((x as IntakeItem)?.productId), qty: Math.round(Number((x as IntakeItem)?.qty) * 2) / 2 }))
    .filter((x) => Number.isInteger(x.productId) && x.qty > 0 && x.qty <= 40);
  const ids = items.map((x) => x.productId);
  const products = ids.length
    ? await all<ProductRow>(`SELECT id, name, brand, kind, carbs, sodium, caffeine, unit, barcode, source FROM fuel_products WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`, [userId, ...ids])
    : [];
  const minutes = await minutesOn(userId, date);
  const plan = await one<{ description: string }>("SELECT description FROM plan_sessions WHERE user_id = ? AND date = ? AND template IN ('long', 'b2b', 'test') ORDER BY id LIMIT 1", [userId, date]);
  const st = intakeStats(items, products as FuelProduct[], minutes);
  const snapshot = items.flatMap((it) => { const p = products.find((x) => x.id === it.productId); return p ? [{ productId: p.id, name: p.name, carbs: p.carbs, qty: it.qty }] : []; });
  if (!snapshot.length) await run("DELETE FROM fuel_intakes WHERE user_id = ? AND date = ?", [userId, date]);
  else await run("INSERT OR REPLACE INTO fuel_intakes(user_id, date, items, carbs, minutes, g_per_hour, target, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [userId, date, JSON.stringify(snapshot), st.carbs, minutes, st.gPerHour, targetOf(plan?.description), Date.now()]);
  // Le ressenti déjà donné porte désormais sur ce qui a vraiment été pris : la progression part de ce repère.
  const changed = st.gPerHour != null ? await run("UPDATE fuel_logs SET target = ?, updated_at = ? WHERE user_id = ? AND date = ?", [st.gPerHour, Date.now(), userId, date]) : null;
  return { ...(await intakeFor(userId, date)), sodium: st.sodium, caffeine: st.caffeine, feelUpdated: !!changed?.changes };
}

/** Glucides par heure réellement pris ce jour-là (s'ils ont été notés), pour le ressenti de l'alimentation. */
export async function takenPerHour(userId: number, date: string) {
  return (await one<{ g: number | null }>("SELECT g_per_hour AS g FROM fuel_intakes WHERE user_id = ? AND date = ?", [userId, date]))?.g ?? null;
}

/** Ce que le coureur a testé à l'entraînement : repère pour le plan de course. */
export async function fuelSummary(userId: number) {
  const rows = await all<{ date: string; feel: string; target: number | null; g: number | null; items: string | null }>(
    "SELECT l.date, l.feel, l.target, i.g_per_hour AS g, i.items FROM fuel_logs l LEFT JOIN fuel_intakes i ON i.user_id = l.user_id AND i.date = l.date WHERE l.user_id = ? ORDER BY l.date", [userId]);
  const best = testedBest(rows.map((r) => ({ date: r.date, feel: r.feel, gPerHour: r.g ?? r.target })));
  const okProducts = new Map<string, number>();
  for (const r of rows) if (r.feel === "ok" && r.items) for (const it of JSON.parse(r.items) as { name: string }[]) okProducts.set(it.name, (okProducts.get(it.name) ?? 0) + 1);
  return { tests: rows.length, best, products: [...okProducts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name) };
}
