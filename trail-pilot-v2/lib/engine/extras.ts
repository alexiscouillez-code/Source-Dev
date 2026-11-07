import { addDays, diffDays, mondayOf } from "./dates";
import { raceDemands, type Level, type PlanItem } from "./planner";

/**
 * Compléments au plan, appliqués après sa génération :
 *  - renforcement : contenu adapté à la phase, et 20 min après un footing facile les semaines sans séance dédiée ;
 *  - courses de préparation : allègement avant, course à la place de la sortie longue, récupération après.
 */
const r5 = (n: number) => Math.max(20, Math.round(n / 5) * 5);
const easy = (date: string, minutes: number, phase: string): PlanItem => ({
  date, template: "easy", phase, sport: "course", title: "Endurance facile", durationMin: r5(minutes), rpeTarget: 3, gainM: null,
  description: "Allure conversation sur terrain souple si possible. L’essentiel est d’être régulier, pas rapide.",
});
const sharpen = (date: string, phase: string): PlanItem => ({
  date, template: "sharpen", phase, sport: "course", title: "Rappel d’allure", durationMin: 20, rpeTarget: 5, gainM: null,
  description: "10 min faciles, puis 4 × 1 min un peu plus vite, 1 min de trot entre. Tu dois finir frais.",
});

// ---------- Renforcement ----------
const BUILD = new Set(["Fondation", "Développement", "Spécifique", "Entretien"]);

/** Contenu du renforcement selon la phase : général, puis dynamique, puis excentrique pour la descente. */
export function strengthText(phase: string, minutes: number) {
  const tours = minutes >= 40 ? "3 tours" : "2 tours";
  if (phase === "Développement") return `Renforcement dynamique, ${tours} : squats sautés, fentes alternées, montées de genoux sur marche, sauts à la corde ou bondissements légers, gainage latéral. 30 s par exercice, 30 s de récupération. Arrête un exercice si l’atterrissage devient lourd.`;
  if (phase === "Spécifique") return `Renforcement pour la descente, ${tours} : squats lents (4 s pour descendre), fentes arrière, descentes de marche sur une jambe, chaise contre un mur, mollets excentriques. 8 à 10 répétitions contrôlées. C’est ce qui protège les cuisses en fin de course.`;
  return `Renforcement général, ${tours} : gainage face et côtés, pont fessier, squats, fentes, montées de mollets, équilibre sur une jambe. 40 s par exercice. Priorité à la qualité du geste.`;
}

export function withStrength(items: PlanItem[]): PlanItem[] {
  const out = items.map((p) => (p.template === "strength" ? { ...p, description: strengthText(p.phase, p.durationMin) } : p));
  const weeks = new Map<string, PlanItem[]>();
  for (const p of out) { const k = mondayOf(p.date); weeks.set(k, [...(weeks.get(k) ?? []), p]); }
  for (const list of weeks.values()) {
    if (list.some((p) => p.template === "strength" || p.template === "race") || !BUILD.has(list[0].phase)) continue;
    const e = list.find((p) => p.template === "easy");
    if (!e) continue;
    const i = out.indexOf(e);
    out[i] = { ...e, title: "Endurance facile + renforcement", description: `${e.description} Ensuite, 20 min de renforcement. ${strengthText(e.phase, 20)}` };
  }
  return out;
}

// ---------- Courses de préparation ----------
export interface SideRace { name: string; date: string; distanceKm: number | null; gainM: number | null; priority: "B" | "C" }

/**
 *  - B (objectif secondaire) : deux jours plus légers avant, rappel d’allure la veille, récupération le lendemain ;
 *  - C (course d’entraînement) : veille facile, course à effort contrôlé, footing de récupération le lendemain.
 * La course remplace la sortie longue de sa semaine.
 */
export function withSideRaces(items: PlanItem[], races: SideRace[], o: { start: string; level: Level; ctl: number; mainDate: string | null }): PlanItem[] {
  let out = [...items];
  for (const r of [...races].sort((a, b) => a.date.localeCompare(b.date))) {
    if (r.date < o.start || r.date === o.mainDate) continue;
    const d = raceDemands({ name: r.name, date: r.date, distanceKm: r.distanceKm, gainM: r.gainM }, o.level, o.ctl);
    const near = out.find((i) => Math.abs(diffDays(i.date, r.date)) <= 3);
    const phase = near?.phase ?? "Entretien";
    const B = r.priority === "B";
    const swap = (date: string, f: (p: PlanItem) => PlanItem | null) => { out = out.flatMap((p) => { if (p.date !== date) return [p]; const n = f(p); return n ? [n] : []; }); };
    const mon = mondayOf(r.date), sun = addDays(mon, 6);
    for (const p of [...out]) if (p.date >= mon && p.date <= sun && p.date !== r.date && ["long", "b2b", "test"].includes(p.template)) swap(p.date, (x) => easy(x.date, 45, x.phase));
    swap(addDays(r.date, -1), (x) => (B ? sharpen(x.date, x.phase) : easy(x.date, 30, x.phase)));
    if (B) swap(addDays(r.date, -2), (x) => easy(x.date, Math.min(40, x.durationMin), x.phase));
    swap(addDays(r.date, 1), (x) => (d.effortKm >= 40 ? null : { ...easy(x.date, 30, x.phase), title: "Footing de récupération", rpeTarget: 2, description: "Lendemain de course : 30 min très faciles ou de la marche, pour relancer la circulation. Aucune intensité." }));
    if (B && d.effortKm >= 25) swap(addDays(r.date, 2), (x) => (x.rpeTarget > 4 ? easy(x.date, 35, x.phase) : x));
    out = out.filter((p) => p.date !== r.date);
    out.push({
      date: r.date, template: "race", sport: "trail", phase, gainM: r.gainM, durationMin: d.raceMin, rpeTarget: B ? 7 : 5,
      title: `${r.name} · course de préparation`,
      description: B
        ? "Objectif secondaire : cours-la sérieusement mais sans te mettre dans le rouge, c’est une étape vers ta course principale. Teste ta nutrition, ton matériel et ta gestion d’allure."
        : "Course d’entraînement : vise un effort contrôlé (6/10 au plus), comme une sortie longue en conditions réelles. Profites-en pour tester ravitaillements et matériel.",
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
