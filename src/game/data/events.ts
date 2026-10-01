export interface EventChoiceDef {
  id: string;
  label: string;
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  choices: EventChoiceDef[];
}

const STANDARD: EventChoiceDef[] = [
  { id: "continuer", label: "Continuer" },
  { id: "ralentir", label: "Ralentir" },
  { id: "adapter", label: "Adapter" },
  { id: "risquer", label: "Prendre un risque" },
];

export const EVENTS: Record<string, EventDef> = {
  pluie: {
    id: "pluie",
    title: "Pluie forte",
    text: "La pluie rend le terrain glissant. Chaque appui demande plus d'attention.",
    choices: STANDARD,
  },
  chaleur: {
    id: "chaleur",
    title: "Chaleur",
    text: "Le soleil tape. La soif monte plus vite que l'allure.",
    choices: STANDARD,
  },
  froid: {
    id: "froid",
    title: "Froid",
    text: "Le froid entre dans les mains et casse le rythme.",
    choices: STANDARD,
  },
  brouillard: {
    id: "brouillard",
    title: "Brouillard",
    text: "La visibilité tombe. Le sentier se devine plus qu'il ne se voit.",
    choices: STANDARD,
  },
  boue: {
    id: "boue",
    title: "Boue",
    text: "La boue colle aux chaussures et aspire chaque foulée.",
    choices: STANDARD,
  },
  crampe: {
    id: "crampe",
    title: "Crampe",
    text: "Le mollet se bloque. Forcer maintenant peut tout casser.",
    choices: STANDARD,
  },
  probleme_materiel: {
    id: "probleme_materiel",
    title: "Problème matériel",
    text: "Une lanière lâche. L'accroche n'est plus fiable.",
    choices: STANDARD,
  },
  baisse_moral: {
    id: "baisse_moral",
    title: "Baisse de moral",
    text: "L'envie décroche. La course paraît plus longue que le profil.",
    choices: STANDARD,
  },
  manque_eau: {
    id: "manque_eau",
    title: "Manque d'eau",
    text: "Les réserves sont trop justes pour le rythme actuel.",
    choices: STANDARD,
  },
  fatigue_importante: {
    id: "fatigue_importante",
    title: "Fatigue importante",
    text: "Les jambes deviennent lourdes. Le geste se dégrade.",
    choices: STANDARD,
  },
  descente_technique: {
    id: "descente_technique",
    title: "Descente technique",
    text: "La pente casse, les appuis roulent. Aller vite se paie.",
    choices: STANDARD,
  },
  montee_brutale: {
    id: "montee_brutale",
    title: "Montée brutale",
    text: "La pente se redresse d'un coup. Le haut du corps doit travailler.",
    choices: STANDARD,
  },
  second_souffle: {
    id: "second_souffle",
    title: "Second souffle",
    text: "Le terrain s'ouvre et les jambes répondent encore.",
    choices: [
      { id: "pousser", label: "Pousser" },
      { id: "consolider", label: "Consolider" },
    ],
  },
};

export function eventById(id: string): EventDef | undefined {
  return EVENTS[id];
}
