/**
 * Cibles corrigées selon les conditions du jour.
 *  - Chaleur : au-delà d’environ 18 °C ressentis, l’allure à effort égal ralentit d’environ 0,6 % par degré
 *    (soit 3 à 8 % entre 24 et 30 °C, les repères usuels), plafonné à 12 %. La FC cible ne change pas :
 *    c’est elle qui protège de la surchauffe. On conseille de courir tôt quand l’après-midi est chaud.
 *  - Froid, vent fort, pluie, neige : pas de correction chiffrée, des consignes.
 *  - Terrain : quand la séance prévoit beaucoup de dénivelé, l’allure sur plat n’a pas de sens en côte.
 * Les prévisions sont journalières (maximum de la journée) : la correction est un plafond, pas une règle horaire.
 */
export interface DayWeather { date: string; tMin: number; tMax: number; feelsMax: number; rainProb: number | null; windMax: number; code: number; label: string }
export interface Conditions { factor: number; feels: number | null; notes: string[]; tone: "chaud" | "tres-chaud" | "froid" | "normal"; hilly: boolean }

const SNOW = [71, 73, 75, 77, 85, 86];
const STORM = [95, 96, 99];

export function heatFactor(feels: number) {
  return 1 + Math.min(0.12, Math.max(0, feels - 18) * 0.006);
}

export function conditionsFor(s: { template: string; sport?: string; durationMin: number; gainM: number | null }, w?: DayWeather | null): Conditions {
  const notes: string[] = [];
  let factor = 1, tone: Conditions["tone"] = "normal";
  const trail = s.sport === "trail" || (s.gainM ?? 0) >= 150;
  if (w) {
    factor = heatFactor(w.feelsMax);
    if (w.feelsMax >= 30) { tone = "tres-chaud"; notes.push(`Jusqu’à ${w.feelsMax} °C ressentis : cours avant 9 h si tu peux. Sinon ralentis franchement, bois toutes les 15 min et garde la FC dans la zone, même si l’allure s’effondre.`); }
    else if (w.feelsMax >= 22) { tone = "chaud"; notes.push(`Jusqu’à ${w.feelsMax} °C ressentis : allure ralentie d’environ ${Math.round((factor - 1) * 100)} % au plus chaud. Le matin, l’allure habituelle reste valable.`); }
    else if (w.tMin <= -2 || w.feelsMax <= 2) { tone = "froid"; notes.push(`Froid (${w.tMin} °C le matin) : échauffement plus long, couches fines et gants. Les premières minutes paraîtront plus dures, c’est normal.`); }
    if (w.windMax >= 35) notes.push(`Vent fort (${w.windMax} km/h) : vent de face, cale-toi sur la FC plutôt que sur l’allure.`);
    if (STORM.includes(w.code)) notes.push("Orages annoncés : évite les crêtes et les sommets, garde une sortie de repli.");
    else if (SNOW.includes(w.code) && trail) notes.push("Neige annoncée : sentiers glissants, réduis l’allure en descente et prévois une couche de plus.");
    else if ((w.rainProb ?? 0) >= 70 && trail) notes.push("Pluie probable : rochers et racines glissants, raccourcis la foulée en descente.");
  }
  const perHour = s.durationMin > 0 && s.gainM ? (s.gainM / s.durationMin) * 60 : 0;
  const hilly = perHour >= 250 || (s.gainM ?? 0) >= 400;
  if (hilly && (s.template === "easy" || s.template === "long" || s.template === "test"))
    notes.push(`${s.gainM} m de D+ prévus : l’allure ne vaut que sur le plat. En côte, suis la FC et marche dès qu’elle dépasse la zone ; en descente, reste relâché sans chercher le chrono.`);
  return { factor, feels: w ? w.feelsMax : null, notes, tone, hilly };
}

/** Allure corrigée (secondes par km) : on ralentit, on n’accélère jamais. */
export const slowed = (sec: number, factor: number) => Math.round(sec * Math.max(1, factor));
