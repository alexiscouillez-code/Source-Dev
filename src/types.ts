export type RaceId = "occ" | "ccc" | "utmb";

export type Terrain = "valley" | "forest" | "alpine" | "rock" | "snow";

export type Landmark = "village" | "lake" | "col" | "summit" | "finish";

export type Segment = {
  id: string;
  from: string;
  to: string;
  km: number;
  elevation: number;
  altStart: number;
  altEnd: number;
  terrain: Terrain;
  landmark: Landmark;
};

export type Race = {
  id: RaceId;
  lengthLabel: string;
  short: string;
  name: string;
  blurb: string;
  segments: Segment[];
};

export type Hair = "court" | "chignon" | "casquette" | "rase";

export type Avatar = {
  name: string;
  skin: number;
  hair: Hair;
  jersey: number;
};

export type Save = {
  v: 1;
  raceId: RaceId;
  avatar: Avatar;
  segmentIndex: number;
  kmFilled: number;
  elevationFilled: number;
  outings: number;
  lastComment: string | null;
};
