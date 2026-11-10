import { addDays } from "./dates";
import type { Review } from "./review";

/**
 * Le plan apprend de ce qui a été fait. À partir des 14 derniers jours (prévu / réalisé et séances manquées),
 * quelques règles d’entraîneur, volontairement prudentes :
 *  - séances manquées : on ne rattrape pas, la semaine qui vient est allégée et sa 2e séance de qualité devient de l’endurance ;
 *  - footings et sorties longues courus trop vite : rappel de la limite cardio sur les prochaines sorties faciles ;
 *  - séances de qualité mal tenues (trop courtes ou trop intenses) : la prochaine est raccourcie et un cran moins intense ;
 *  - sorties longues écourtées : les prochaines repartent de la dernière durée tenue, +15 % au plus ;
 *  - séances de qualité « trop faciles » : pas de changement, mais les zones sont sans doute à revoir.
 * Rien n’est modifié si les signaux sont isolés : il en faut au moins deux.
 */
export interface Past { date: string; template: string; status: string; duration: number | null; review: Review | null }
export type LearnKind = "missed" | "easy-fast" | "quality-hard" | "long-short" | "quality-easy" | "on-track";
export interface Learned { kind: LearnKind; text: string; changes: boolean }
export interface Learning { items: Learned[]; sig: string; z2Max: number | null; longCap: number | null }

const QUALITY = new Set(["tempo", "hills", "climb", "downhill", "sharpen"]);
const EASY = new Set(["easy", "long"]);

export function learn(past: Past[], today: string, z2Max: number | null): Learning {
  const recent = past.filter((p) => p.date < today && p.date >= addDays(today, -14)).sort((a, b) => a.date.localeCompare(b.date));
  const items: Learned[] = [];
  const missed = recent.filter((p) => p.status === "missed" && p.date >= addDays(today, -7) && p.template !== "strength" && p.template !== "race").length;
  if (missed >= 2) items.push({ kind: "missed", changes: true, text: `${missed} séances manquées en 7 jours : on ne rattrape pas. Les 7 prochains jours sont allégés de 15 % et la 2e séance de qualité devient de l’endurance.` });

  const reviewed = recent.filter((p) => p.status === "done" && p.review);
  const easy = reviewed.filter((p) => EASY.has(p.template)).slice(-4);
  const fast = easy.filter((p) => p.review!.verdict === "intense").length;
  if (fast >= 2) items.push({ kind: "easy-fast", changes: true, text: `${fast} sorties faciles sur les ${easy.length} dernières courues trop vite. La fatigue s’accumule sans que l’endurance progresse plus vite : ${z2Max ? `reste sous ${z2Max} bpm` : "reste en aisance respiratoire"}, quitte à marcher dans les côtes. Le rappel est ajouté à tes prochaines sorties faciles.` });

  const quality = reviewed.filter((p) => QUALITY.has(p.template)).slice(-3);
  const hard = quality.filter((p) => p.review!.verdict === "courte" || p.review!.verdict === "intense").length;
  const soft = quality.filter((p) => p.review!.verdict === "facile").length;
  if (hard >= 2) items.push({ kind: "quality-hard", changes: true, text: `${hard} séances de qualité sur les ${quality.length} dernières ont été dures à tenir. La prochaine est raccourcie de 15 % et un cran moins intense : mieux vaut une séance réussie qu’une séance subie.` });
  else if (soft >= 2) items.push({ kind: "quality-easy", changes: false, text: "Tes dernières séances de qualité ont été courues sous la zone visée. Si elles te paraissent faciles, ta FC max est sans doute sous-estimée : vérifie-la dans Compte pour recaler tes zones." });

  const longs = reviewed.filter((p) => p.template === "long").slice(-3);
  const shortLongs = longs.filter((p) => p.review!.verdict === "courte");
  let longCap: number | null = null;
  if (shortLongs.length >= 2) {
    const lastHeld = Math.max(...longs.map((p) => p.duration ?? 0));
    longCap = Math.max(60, Math.round((lastHeld * 1.15) / 5) * 5);
    items.push({ kind: "long-short", changes: true, text: `${shortLongs.length} sorties longues écourtées : les prochaines repartent de ta dernière durée tenue, ${longCap} min au plus, et remonteront ensuite progressivement.` });
  }

  if (!items.length && reviewed.length >= 4 && reviewed.slice(-4).every((p) => p.review!.verdict === "tenue"))
    items.push({ kind: "on-track", changes: false, text: "Tes 4 dernières séances ont été tenues : le plan continue comme prévu." });

  const sig = items.filter((i) => i.changes).map((i) => i.kind).sort().join(",");
  return { items, sig, z2Max, longCap };
}

interface Item { date: string; template: string; title: string; durationMin: number; rpeTarget: number; description: string; gainM: number | null }

/** Applique ce que le plan a appris aux séances à venir (à partir de demain). */
export function applyLearning<T extends Item>(items: T[], l: Learning, today: string): T[] {
  const kinds = new Set(l.items.filter((i) => i.changes).map((i) => i.kind));
  if (!kinds.size) return items;
  const week = addDays(today, 7), fortnight = addDays(today, 14);
  let out = items.map((x) => ({ ...x }));
  if (kinds.has("missed")) {
    let qualityLeft = 1;
    out = out.map((x) => {
      if (x.date > week || x.template === "race" || x.template === "strength") return x;
      if (QUALITY.has(x.template) && qualityLeft-- <= 0)
        return { ...x, template: "easy", title: "Endurance (allègement)", rpeTarget: 4, gainM: null, durationMin: Math.round((x.durationMin * 0.85) / 5) * 5,
          description: "Séance de qualité remplacée par de l’endurance : la semaine précédente a été incomplète, on reprend le fil sans forcer." };
      return { ...x, durationMin: Math.max(20, Math.round((x.durationMin * 0.85) / 5) * 5), gainM: x.gainM ? Math.round(x.gainM * 0.85) : x.gainM };
    });
  }
  if (kinds.has("quality-hard")) {
    const i = out.findIndex((x) => QUALITY.has(x.template) && x.date > today);
    if (i >= 0) out[i] = { ...out[i], durationMin: Math.max(30, Math.round((out[i].durationMin * 0.85) / 5) * 5), rpeTarget: Math.max(5, out[i].rpeTarget - 1),
      description: `${out[i].description} Allégée : tes dernières séances de qualité ont été dures à tenir, vise la régularité plutôt que l’intensité.` };
  }
  if (kinds.has("long-short") && l.longCap) {
    // Remontée progressive : +10 % par sortie longue, jusqu’à rejoindre le plan d’origine.
    let k = 0;
    out = out.map((x) => {
      if (x.template !== "long" || x.date <= today) return x;
      const cap = Math.round((l.longCap! * (1 + 0.1 * k++)) / 5) * 5;
      return x.durationMin > cap ? { ...x, durationMin: cap, gainM: x.gainM ? Math.round((x.gainM * cap) / x.durationMin) : x.gainM } : x;
    });
  }
  if (kinds.has("easy-fast")) {
    const note = l.z2Max ? ` Reste sous ${l.z2Max} bpm, même si l’allure te paraît lente.` : " Reste en aisance respiratoire, même si l’allure te paraît lente.";
    out = out.map((x) => EASY.has(x.template) && x.date <= fortnight && !x.description.includes(note.trim()) ? { ...x, description: x.description + note } : x);
  }
  return out;
}
