/**
 * Carburant du traileur : assiette du jour selon la charge, récupération après une grosse séance, et ce qui a
 * réellement été pris pendant une sortie longue (glucides par heure comparés à la cible).
 *
 * Volontairement sans calories ni poids : on parle de proportions dans l'assiette et de glucides pendant l'effort.
 * L'objectif est de manger assez pour s'entraîner, jamais de manger moins.
 *
 * Assiettes : repères des diététiciens du sport (assiette de l'athlète, entraînement facile / modéré / dur).
 *  - facile : moitié légumes et fruits, un quart féculents, un quart protéines ;
 *  - modéré : 40 % légumes et fruits, 35 % féculents, 25 % protéines ;
 *  - dur : moitié féculents, un quart légumes et fruits, un quart protéines.
 */
export type DayKind = "facile" | "modere" | "dur";
export interface Plate { feculents: number; legumes: number; proteines: number }
export interface SessionLike { template: string; durationMin: number; sport?: string; status?: string }

export const PLATES: Record<DayKind, Plate> = {
  facile: { feculents: 25, legumes: 50, proteines: 25 },
  modere: { feculents: 35, legumes: 40, proteines: 25 },
  dur: { feculents: 50, legumes: 25, proteines: 25 },
};
export const DAY_LABEL: Record<DayKind, string> = { facile: "Jour facile", modere: "Jour modéré", dur: "Grosse journée" };

const QUALITY = new Set(["tempo", "hills", "climb", "downhill", "sharpen", "test"]);
const BIG = new Set(["long", "b2b", "race"]);

/**
 * Type de journée pour l'assiette. On regarde la séance du jour (ou ce qui a été fait, si c'est plus long) et la veille
 * d'une sortie longue ou d'une course : ces jours-là, on remplit les réserves.
 */
export function dayKind(o: { today: SessionLike | null; doneMin?: number; tomorrow: SessionLike | null }): { kind: DayKind; reason: string } {
  const t = o.today && o.today.template !== "rest" ? o.today : null;
  const min = Math.max(t?.status === "skipped" ? 0 : t?.durationMin ?? 0, o.doneMin ?? 0);
  const tm = o.tomorrow;
  if (tm?.template === "race") return { kind: "dur", reason: "Veille de course : on remplit les réserves avec des féculents à chaque repas, sans tester de plat nouveau." };
  if (t && t.template === "race") return { kind: "dur", reason: "Jour de course : des féculents avant, et de quoi récupérer après." };
  if (min >= 120 || (t && BIG.has(t.template) && min >= 90)) return { kind: "dur", reason: "Grosse séance aujourd’hui : la moitié de l’assiette en féculents pour recharger." };
  if (tm && BIG.has(tm.template) && tm.durationMin >= 105) return { kind: "dur", reason: "Sortie longue demain : des féculents ce soir pour partir les réserves pleines." };
  if (min >= 60 || (t && QUALITY.has(t.template))) return { kind: "modere", reason: t && QUALITY.has(t.template) ? "Séance de qualité aujourd’hui : un tiers de féculents environ." : "Une heure ou plus aujourd’hui : un tiers de féculents environ." };
  return { kind: "facile", reason: t && min > 0 ? "Séance courte et facile : plus de légumes, autant de protéines." : "Jour de repos : plus de légumes, autant de protéines. Écoute ta faim, elle est souvent plus forte le lendemain d’une grosse journée." };
}

/** Exemples concrets par part de l'assiette (cuisine du quotidien). */
export const PLATE_EXAMPLES: Record<keyof Plate, string> = {
  feculents: "pâtes, riz, pommes de terre, semoule, pain, quinoa, lentilles",
  legumes: "crudités, légumes cuits, salade, fruits",
  proteines: "œufs, poisson, viande, tofu, yaourt, fromage blanc",
};

// ---------- Récupération ----------
export interface RecoveryAdvice { title: string; why: string; items: string[]; next: string | null }

/**
 * Après une séance lourde (75 min et plus, qualité, effort ressenti dur), manger dans l'heure accélère la recharge :
 * des glucides pour les réserves, des protéines pour les muscles, de l'eau et du sel.
 * Repères usuels : environ 1 g de glucides par kilo et 20 à 25 g de protéines ; ici traduits en portions.
 */
export function recoveryFor(o: { durationMin: number; template?: string | null; effort?: number | null; tomorrow?: SessionLike | null }): RecoveryAdvice | null {
  const heavy = o.durationMin >= 75 || (!!o.template && (QUALITY.has(o.template) || BIG.has(o.template))) || (o.effort ?? 0) >= 7;
  if (!heavy || o.durationMin < 30) return null;
  const long = o.durationMin >= 150;
  const items = [
    long ? "Un vrai repas dans l’heure : une grande part de féculents (riz, pâtes, pommes de terre) avec des œufs, du poisson ou de la viande." : "Une collation dans l’heure : par exemple un bol de céréales avec du lait, ou un sandwich jambon ou fromage, ou un yaourt à boire et une banane.",
    "Bois de l’eau par petites gorgées jusqu’à retrouver une urine claire ; un peu de sel (bouillon, pain, fromage) si tu as beaucoup transpiré.",
  ];
  const tm = o.tomorrow;
  const next = tm && tm.template !== "rest" && tm.template !== "strength" && (QUALITY.has(tm.template) || BIG.has(tm.template))
    ? "Une séance importante t’attend demain : garde des féculents au dîner pour repartir rechargé."
    : null;
  return {
    title: long ? "Récupère : repas complet dans l’heure" : "Récupère : collation dans l’heure",
    why: "Glucides pour refaire les réserves, protéines pour réparer les muscles : c’est dans l’heure qui suit que le corps les stocke le mieux.",
    items, next,
  };
}

// ---------- Prises pendant une sortie ----------
export interface FuelProduct { id: number; name: string; carbs: number; sodium?: number | null; caffeine?: number | null }
export interface IntakeItem { productId: number; qty: number }
export interface IntakeStats { carbs: number; sodium: number; caffeine: number; gPerHour: number | null; units: number }

/**
 * Totaux d'une sortie. Les glucides par heure se comptent à partir de la 30e minute, comme la cible
 * (on ne mange pas pendant la première demi-heure).
 */
export function intakeStats(items: IntakeItem[], products: FuelProduct[], minutes: number | null): IntakeStats {
  let carbs = 0, sodium = 0, caffeine = 0, units = 0;
  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    if (!p || !(it.qty > 0)) continue;
    carbs += p.carbs * it.qty; sodium += (p.sodium ?? 0) * it.qty; caffeine += (p.caffeine ?? 0) * it.qty; units += it.qty;
  }
  const h = minutes && minutes > 0 ? Math.max(0.5, minutes / 60 - 0.5) : null;
  return { carbs: Math.round(carbs), sodium: Math.round(sodium), caffeine: Math.round(caffeine), units, gPerHour: h ? Math.round(carbs / h) : null };
}

export type IntakeVerdict = "dans-cible" | "en-dessous" | "au-dessus";
/** Comparaison à la cible : à 15 % près, c'est dans la cible. */
export function compareIntake(gPerHour: number | null, target: number | null): { verdict: IntakeVerdict; text: string } | null {
  if (gPerHour == null || !target) return null;
  if (gPerHour < target * 0.85) return { verdict: "en-dessous", text: `${gPerHour} g/h pris pour ${target} g/h visés : ajoute une prise toutes les 30 à 40 minutes la prochaine fois, quitte à fractionner les gels.` };
  if (gPerHour > target * 1.15) return { verdict: "au-dessus", text: `${gPerHour} g/h pris pour ${target} g/h visés : si c’est bien passé, ton ventre supporte plus que prévu, garde ce repère pour le jour J.` };
  return { verdict: "dans-cible", text: `${gPerHour} g/h pris pour ${target} g/h visés : dans la cible.` };
}

/** Meilleur apport testé sans souci : le repère à reporter dans le plan de course. */
export function testedBest(logs: { date: string; feel: string; gPerHour: number | null }[]): { gPerHour: number; date: string } | null {
  let best: { gPerHour: number; date: string } | null = null;
  for (const l of logs) if (l.feel === "ok" && l.gPerHour != null && (!best || l.gPerHour > best.gPerHour)) best = { gPerHour: l.gPerHour, date: l.date };
  return best;
}

// ---------- Photo d'assiette ----------
export interface PlateReading { feculents: number; legumes: number; proteines: number; foods: string[] }

/** Ramène une lecture de photo à des pourcentages propres (somme 100), ou null si elle n'a pas de sens. */
export function cleanPlate(raw: unknown): PlateReading | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const n = (k: string) => { const v = Number(r[k]); return Number.isFinite(v) && v > 0 ? v : 0; };
  const f = n("feculents"), l = n("legumes"), p = n("proteines");
  const sum = f + l + p;
  if (sum <= 0) return null;
  const pct = (v: number) => Math.round((v / sum) * 100);
  const foods = Array.isArray(r.foods) ? r.foods.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 40)).slice(0, 8) : [];
  return { feculents: pct(f), legumes: pct(l), proteines: pct(p), foods };
}

/**
 * Retour sur une assiette photographiée, comparée à celle du jour. Jamais de « trop manger » : on ne propose que
 * d'ajouter ce qui manque pour l'entraînement (féculents un jour dur, légumes ou protéines sinon).
 */
export function plateFeedback(read: PlateReading, kind: DayKind): { ok: boolean; text: string } {
  const t = PLATES[kind];
  const lowCarb = read.feculents < t.feculents - 12;
  const lowProt = read.proteines < t.proteines - 12;
  const lowVeg = read.legumes < t.legumes - 15;
  if (lowCarb && kind !== "facile") return { ok: false, text: kind === "dur" ? "Il manque des féculents pour une grosse journée : ajoute du pain, du riz ou des pommes de terre pour remplir les réserves." : "Un peu juste en féculents pour la séance du jour : ajoute une part de pâtes, riz ou pain." };
  if (lowProt) return { ok: false, text: "Ajoute une source de protéines (œufs, poisson, viande, tofu, yaourt) : elles réparent les muscles après l’effort." };
  if (lowVeg && kind !== "dur") return { ok: false, text: "Ajoute des légumes ou un fruit : vitamines, fibres et minéraux pour bien récupérer." };
  return { ok: true, text: kind === "dur" ? "Belle assiette pour une grosse journée : assez de féculents pour recharger." : "Assiette équilibrée pour la journée : rien à changer." };
}

// ---------- Produit lu sur une étiquette ----------
export const PRODUCT_KINDS = ["gel", "barre", "boisson", "compote", "pate", "solide", "autre"] as const;
export type ProductKind = typeof PRODUCT_KINDS[number];
export const KIND_LABEL: Record<ProductKind, string> = { gel: "Gel", barre: "Barre", boisson: "Boisson", compote: "Compote", pate: "Pâte de fruits", solide: "Solide", autre: "Autre" };
export interface ProductDraft { name: string; brand: string | null; kind: ProductKind; carbs: number | null; sodium: number | null; caffeine: number | null; unit: string | null; barcode: string | null }

const num = (v: unknown, max: number) => { const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null; };
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Nettoie un produit (saisi, lu sur une étiquette ou venu d'Open Food Facts) : bornes réalistes, champs courts. */
export function cleanDraft(raw: unknown): ProductDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 60);
  if (!name) return null;
  const kind = (PRODUCT_KINDS as readonly string[]).includes(String(r.kind)) ? (r.kind as ProductKind) : "autre";
  const code = typeof r.barcode === "string" ? r.barcode.replace(/\D/g, "") : "";
  return {
    name, brand: str(r.brand, 40), kind,
    carbs: num(r.carbs ?? r.carbsPerUnit, 200), sodium: num(r.sodium ?? r.sodiumMg, 3000), caffeine: num(r.caffeine ?? r.caffeineMg, 400),
    unit: str(r.unit, 30), barcode: code.length >= 8 && code.length <= 14 ? code : null,
  };
}

/** Devine le type d'un produit d'après son nom (Open Food Facts ne le dit pas). */
export function guessKind(name: string): ProductKind {
  const n = name.toLowerCase();
  if (/\bgel|gel\b|gels\b/.test(n)) return "gel";
  if (/barre|bar\b/.test(n)) return "barre";
  if (/boisson|drink|isoton|poudre|hydrat/.test(n)) return "boisson";
  if (/compote|pur[ée]e/.test(n)) return "compote";
  if (/p[âa]te de fruit|gomme|gummies|chew/.test(n)) return "pate";
  return "autre";
}

/**
 * Fiche Open Food Facts → produit : glucides par portion si elle est donnée, sinon par emballage (un gel, une barre)
 * à partir des valeurs pour 100 g et du poids net.
 */
export function fromOpenFoodFacts(code: string, p: Record<string, unknown> | null | undefined): ProductDraft | null {
  if (!p) return null;
  const nm = (p.nutriments ?? {}) as Record<string, unknown>;
  const name = str(p.product_name_fr, 60) ?? str(p.product_name, 60);
  if (!name) return null;
  const qty = (() => { const m = /([\d.,]+)\s*(g|ml)\b/i.exec(String(p.quantity ?? "")); return m ? Number(m[1].replace(",", ".")) : null; })();
  const serving = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : null;
  const per100 = (k: string) => { const v = Number(nm[`${k}_100g`]); return Number.isFinite(v) ? v : null; };
  const perServing = (k: string) => { const v = Number(nm[`${k}_serving`]); return Number.isFinite(v) ? v : null; };
  const unitWeight = serving ?? qty;
  const scale = (k: string) => perServing(k) ?? (per100(k) != null && unitWeight ? (per100(k)! * unitWeight) / 100 : null);
  const sodiumG = scale("sodium") ?? (scale("salt") != null ? scale("salt")! / 2.5 : null);
  const caffeine = scale("caffeine");
  return cleanDraft({
    name, brand: str(String(p.brands ?? "").split(",")[0], 40), kind: guessKind(name),
    // Open Food Facts donne les nutriments en grammes : sodium et caféine passent en milligrammes.
    carbs: scale("carbohydrates"), sodium: sodiumG != null ? sodiumG * 1000 : null, caffeine: caffeine != null ? (caffeine <= 5 ? caffeine * 1000 : caffeine) : null,
    unit: str(p.serving_size, 30) ?? (qty ? `${qty} ${/ml/i.test(String(p.quantity ?? "")) ? "ml" : "g"}` : null),
    barcode: code,
  });
}
