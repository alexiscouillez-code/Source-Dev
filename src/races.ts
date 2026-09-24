import type { Race, RaceId, Segment } from "./types.ts";

/**
 * Schematic segments for the game.
 * Kilometres and positive elevation sum to public 2025 race totals
 * (OCC 57 km / 3 500 m, CCC 101 km / 6 050 m, UTMB 174 km / 9 900 m).
 * Altitudes are rounded elevations of real places, not a survey.
 * The line between them is invented. This is not an official course,
 * trace, logo, or medal.
 */
export const PUBLISHED_TOTALS: Record<
  RaceId,
  { km: number; elevation: number }
> = {
  occ: { km: 57, elevation: 3500 },
  ccc: { km: 101, elevation: 6050 },
  utmb: { km: 174, elevation: 9900 },
};

function defineRace(
  race: Race,
  expected: { km: number; elevation: number },
): Race {
  let km = 0;
  let elevation = 0;
  for (let i = 0; i < race.segments.length; i += 1) {
    const segment = race.segments[i];
    if (!segment) throw new Error("segment manquant");
    if (segment.km <= 0) throw new Error(`${segment.id} : distance nulle`);
    const net = segment.altEnd - segment.altStart;
    if (segment.elevation < Math.max(0, net)) {
      throw new Error(
        `${segment.id} : D+ ${segment.elevation} inférieur à la montée nette ${net}`,
      );
    }
    const next = race.segments[i + 1];
    if (next && next.altStart !== segment.altEnd) {
      throw new Error(`${segment.id} ne rejoint pas ${next.id}`);
    }
    km += segment.km;
    elevation += segment.elevation;
  }
  if (km !== expected.km || elevation !== expected.elevation) {
    throw new Error(
      `${race.id} : ${km} km / ${elevation} m, attendu ${expected.km} / ${expected.elevation}`,
    );
  }
  return race;
}

const occSegments: Segment[] = [
  {
    id: "occ-champex",
    from: "Orsières",
    to: "Champex-Lac",
    km: 14,
    elevation: 800,
    altStart: 900,
    altEnd: 1470,
    terrain: "forest",
    landmark: "lake",
  },
  {
    id: "occ-trient",
    from: "Champex-Lac",
    to: "Trient",
    km: 12,
    elevation: 650,
    altStart: 1470,
    altEnd: 1280,
    terrain: "forest",
    landmark: "village",
  },
  {
    id: "occ-balme",
    from: "Trient",
    to: "Col de Balme",
    km: 10,
    elevation: 980,
    altStart: 1280,
    altEnd: 2200,
    terrain: "alpine",
    landmark: "col",
  },
  {
    id: "occ-vallorcine",
    from: "Col de Balme",
    to: "Vallorcine",
    km: 8,
    elevation: 220,
    altStart: 2200,
    altEnd: 1260,
    terrain: "alpine",
    landmark: "village",
  },
  {
    id: "occ-posettes",
    from: "Vallorcine",
    to: "Col des Posettes",
    km: 6,
    elevation: 780,
    altStart: 1260,
    altEnd: 2000,
    terrain: "alpine",
    landmark: "col",
  },
  {
    id: "occ-chamonix",
    from: "Col des Posettes",
    to: "Chamonix",
    km: 7,
    elevation: 70,
    altStart: 2000,
    altEnd: 1040,
    terrain: "forest",
    landmark: "finish",
  },
];

const cccSegments: Segment[] = [
  {
    id: "ccc-tronche",
    from: "Courmayeur",
    to: "Tête de la Tronche",
    km: 12,
    elevation: 1400,
    altStart: 1220,
    altEnd: 2580,
    terrain: "rock",
    landmark: "summit",
  },
  {
    id: "ccc-ferret",
    from: "Tête de la Tronche",
    to: "Grand Col Ferret",
    km: 15,
    elevation: 700,
    altStart: 2580,
    altEnd: 2537,
    terrain: "snow",
    landmark: "col",
  },
  {
    id: "ccc-fouly",
    from: "Grand Col Ferret",
    to: "La Fouly",
    km: 12,
    elevation: 200,
    altStart: 2537,
    altEnd: 1590,
    terrain: "alpine",
    landmark: "village",
  },
  {
    id: "ccc-champex",
    from: "La Fouly",
    to: "Champex-Lac",
    km: 18,
    elevation: 900,
    altStart: 1590,
    altEnd: 1470,
    terrain: "valley",
    landmark: "lake",
  },
  {
    id: "ccc-trient",
    from: "Champex-Lac",
    to: "Trient",
    km: 14,
    elevation: 620,
    altStart: 1470,
    altEnd: 1280,
    terrain: "forest",
    landmark: "village",
  },
  {
    id: "ccc-balme",
    from: "Trient",
    to: "Col de Balme",
    km: 10,
    elevation: 980,
    altStart: 1280,
    altEnd: 2200,
    terrain: "alpine",
    landmark: "col",
  },
  {
    id: "ccc-vallorcine",
    from: "Col de Balme",
    to: "Vallorcine",
    km: 8,
    elevation: 250,
    altStart: 2200,
    altEnd: 1260,
    terrain: "alpine",
    landmark: "village",
  },
  {
    id: "ccc-cheserys",
    from: "Vallorcine",
    to: "Lacs des Chéserys",
    km: 7,
    elevation: 800,
    altStart: 1260,
    altEnd: 2000,
    terrain: "alpine",
    landmark: "lake",
  },
  {
    id: "ccc-chamonix",
    from: "Lacs des Chéserys",
    to: "Chamonix",
    km: 5,
    elevation: 200,
    altStart: 2000,
    altEnd: 1040,
    terrain: "forest",
    landmark: "finish",
  },
];

const utmbSegments: Segment[] = [
  {
    id: "utmb-contamines",
    from: "Chamonix",
    to: "Les Contamines",
    km: 18,
    elevation: 750,
    altStart: 1040,
    altEnd: 1160,
    terrain: "valley",
    landmark: "village",
  },
  {
    id: "utmb-bonhomme",
    from: "Les Contamines",
    to: "Col du Bonhomme",
    km: 14,
    elevation: 1350,
    altStart: 1160,
    altEnd: 2329,
    terrain: "alpine",
    landmark: "col",
  },
  {
    id: "utmb-chapieux",
    from: "Col du Bonhomme",
    to: "Les Chapieux",
    km: 12,
    elevation: 350,
    altStart: 2329,
    altEnd: 1550,
    terrain: "alpine",
    landmark: "village",
  },
  {
    id: "utmb-seigne",
    from: "Les Chapieux",
    to: "Col de la Seigne",
    km: 14,
    elevation: 1150,
    altStart: 1550,
    altEnd: 2516,
    terrain: "rock",
    landmark: "col",
  },
  {
    id: "utmb-courmayeur",
    from: "Col de la Seigne",
    to: "Courmayeur",
    km: 16,
    elevation: 450,
    altStart: 2516,
    altEnd: 1220,
    terrain: "alpine",
    landmark: "village",
  },
  {
    id: "utmb-favre",
    from: "Courmayeur",
    to: "Arête du Mont-Favre",
    km: 12,
    elevation: 1350,
    altStart: 1220,
    altEnd: 2435,
    terrain: "rock",
    landmark: "summit",
  },
  {
    id: "utmb-ferret",
    from: "Arête du Mont-Favre",
    to: "Grand Col Ferret",
    km: 18,
    elevation: 1100,
    altStart: 2435,
    altEnd: 2537,
    terrain: "snow",
    landmark: "col",
  },
  {
    id: "utmb-fouly",
    from: "Grand Col Ferret",
    to: "La Fouly",
    km: 12,
    elevation: 250,
    altStart: 2537,
    altEnd: 1590,
    terrain: "alpine",
    landmark: "village",
  },
  {
    id: "utmb-champex",
    from: "La Fouly",
    to: "Champex-Lac",
    km: 18,
    elevation: 850,
    altStart: 1590,
    altEnd: 1470,
    terrain: "valley",
    landmark: "lake",
  },
  {
    id: "utmb-trient",
    from: "Champex-Lac",
    to: "Trient",
    km: 14,
    elevation: 700,
    altStart: 1470,
    altEnd: 1280,
    terrain: "forest",
    landmark: "village",
  },
  {
    id: "utmb-flegere",
    from: "Trient",
    to: "La Flégère",
    km: 16,
    elevation: 1200,
    altStart: 1280,
    altEnd: 1877,
    terrain: "alpine",
    landmark: "summit",
  },
  {
    id: "utmb-chamonix",
    from: "La Flégère",
    to: "Chamonix",
    km: 10,
    elevation: 400,
    altStart: 1877,
    altEnd: 1040,
    terrain: "forest",
    landmark: "finish",
  },
];

export const RACES: readonly Race[] = [
  defineRace(
    {
      id: "occ",
      lengthLabel: "Courte",
      short: "OCC",
      name: "Orsières–Chamonix",
      blurb: "D'Orsières à Chamonix, la plus courte des trois.",
      segments: occSegments,
    },
    PUBLISHED_TOTALS.occ,
  ),
  defineRace(
    {
      id: "ccc",
      lengthLabel: "Moyenne",
      short: "CCC",
      name: "Courmayeur–Chamonix",
      blurb: "De Courmayeur à Chamonix, par la Suisse.",
      segments: cccSegments,
    },
    PUBLISHED_TOTALS.ccc,
  ),
  defineRace(
    {
      id: "utmb",
      lengthLabel: "Longue",
      short: "UTMB",
      name: "Tour du Mont-Blanc",
      blurb: "Le tour du massif, départ et arrivée à Chamonix.",
      segments: utmbSegments,
    },
    PUBLISHED_TOTALS.utmb,
  ),
];

export function raceById(id: RaceId): Race {
  const race = RACES.find((item) => item.id === id);
  if (!race) throw new Error(`Course inconnue : ${id}`);
  return race;
}

export function totalKm(race: Race): number {
  return race.segments.reduce((sum, segment) => sum + segment.km, 0);
}

export function totalElevation(race: Race): number {
  return race.segments.reduce((sum, segment) => sum + segment.elevation, 0);
}

export function finishTown(race: Race): string {
  return race.segments[race.segments.length - 1]?.to ?? "l'arrivée";
}
