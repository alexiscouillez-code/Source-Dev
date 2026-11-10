/**
 * Lecture, dans le navigateur, des fichiers exportés par les montres et applis :
 * FIT (Garmin, Coros, Suunto, Wahoo…), TCX (Garmin, Polar) et GPX.
 * On ne garde que les chiffres utiles : date, sport, durée, distance, D+, D−, FC moyenne et max,
 * plus un tracé GPS simplifié (500 points au plus) pour la carte.
 */
import { encodePolyline, thin, type LatLon } from "./polyline";
import { analyze, type Analysis } from "./engine/streams";

export interface ParsedActivity {
  date: string | null; sport: "trail" | "course" | "rando" | "velo" | "renfo" | "autre"; name: string | null;
  durationMin: number | null; distanceKm: number | null; gainM: number | null; lossM: number | null;
  avgHr: number | null; maxHr: number | null; format: "FIT" | "TCX" | "GPX";
  /** Tracé encodé (polyline), absent pour une séance sans GPS. */
  track: string | null;
  /** Résumé de l’analyse seconde par seconde (zones, allure ajustée, VO2max), quand le fichier la permet. */
  analysis?: Analysis | null;
}
const trackOf = (pts: LatLon[], max = 500) => { const v = pts.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0)); return v.length >= 2 ? encodePolyline(thin(v, max)) : null; };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const r1 = (n: number) => Math.round(n * 10) / 10;

function sportFrom(s: string | null | undefined, sub?: string | null, gainPerKm = 0): ParsedActivity["sport"] {
  const v = `${s ?? ""} ${sub ?? ""}`.toLowerCase();
  if (/trail|mountain/.test(v)) return "trail";
  if (/hik|walk|randon/.test(v)) return "rando";
  if (/cycl|bik|vélo|velo|ride/.test(v)) return "velo";
  if (/strength|training|fitness|renfo/.test(v)) return "renfo";
  if (/run|course/.test(v)) return gainPerKm > 25 ? "trail" : "course";
  return gainPerKm > 25 ? "trail" : "autre";
}

/** D+ et D− lissés à 3 m à partir d’une suite d’altitudes. */
function elevation(eles: number[]) {
  let gain = 0, loss = 0, ref: number | null = null;
  for (const e of eles) {
    if (!Number.isFinite(e)) continue;
    if (ref === null) ref = e;
    else if (Math.abs(e - ref) >= 3) { if (e > ref) gain += e - ref; else loss += ref - e; ref = e; }
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
}

function hrStats(hrs: number[]) {
  const v = hrs.filter((h) => h > 30 && h < 240);
  if (!v.length) return { avg: null, max: null };
  return { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), max: Math.max(...v) };
}

const haversine = (a: [number, number], b: [number, number]) => {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function parseXml(text: string) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Fichier illisible.");
  return doc;
}
const tags = (el: Document | Element, name: string) => Array.from(el.getElementsByTagNameNS("*", name));
const num = (el: Element | undefined) => (el ? Number(el.textContent) : NaN);

function parseGpxText(text: string): ParsedActivity {
  const doc = parseXml(text);
  const pts = [...tags(doc, "trkpt"), ...tags(doc, "rtept")];
  if (pts.length < 2) throw new Error("Aucun point de trace dans ce fichier.");
  let dist = 0, prev: [number, number] | null = null, start: number | null = null, end: number | null = null;
  const eles: number[] = [], hrs: number[] = [], line: LatLon[] = [];
  for (const p of pts) {
    const c: [number, number] = [Number(p.getAttribute("lat")), Number(p.getAttribute("lon"))];
    if (prev) dist += haversine(prev, c);
    prev = c; line.push(c);
    eles.push(num(tags(p, "ele")[0]));
    const hr = num(tags(p, "hr")[0]); if (Number.isFinite(hr)) hrs.push(hr);
    const t = Date.parse(tags(p, "time")[0]?.textContent ?? "");
    if (!Number.isNaN(t)) { start ??= t; end = t; }
  }
  const e = elevation(eles), h = hrStats(hrs);
  const type = tags(doc, "type")[0]?.textContent;
  return {
    format: "GPX", date: start != null ? ymd(new Date(start)) : null, name: tags(doc, "name")[0]?.textContent?.trim() || null,
    sport: sportFrom(type, null, dist ? e.gain / dist : 0),
    durationMin: start != null && end != null && end > start ? Math.round((end - start) / 60000) : null,
    distanceKm: r1(dist), gainM: e.gain, lossM: e.loss, avgHr: h.avg, maxHr: h.max, track: trackOf(line),
  };
}

function parseTcxText(text: string): ParsedActivity {
  const doc = parseXml(text);
  const act = tags(doc, "Activity")[0];
  if (!act) throw new Error("Aucune activité dans ce fichier TCX.");
  const laps = tags(act, "Lap");
  const seconds = laps.reduce((s, l) => s + (num(tags(l, "TotalTimeSeconds")[0]) || 0), 0);
  let meters = laps.reduce((s, l) => s + (num(tags(l, "DistanceMeters").find((d) => d.parentElement === l)) || 0), 0);
  const tps = tags(act, "Trackpoint");
  const eles = tps.map((t) => num(tags(t, "AltitudeMeters")[0]));
  const hrs = tps.map((t) => num(tags(tags(t, "HeartRateBpm")[0] ?? t, "Value")[0])).filter(Number.isFinite);
  if (!meters) meters = Math.max(0, ...tps.map((t) => num(tags(t, "DistanceMeters")[0])).filter(Number.isFinite));
  const e = elevation(eles), h = hrStats(hrs);
  const lapMax = Math.max(0, ...laps.map((l) => num(tags(tags(l, "MaximumHeartRateBpm")[0] ?? l, "Value")[0]) || 0));
  const id = Date.parse(tags(act, "Id")[0]?.textContent ?? "");
  const km = meters / 1000;
  return {
    format: "TCX", date: Number.isNaN(id) ? null : ymd(new Date(id)), name: tags(act, "Notes")[0]?.textContent?.trim().slice(0, 120) || null,
    sport: sportFrom(act.getAttribute("Sport"), null, km ? e.gain / km : 0),
    durationMin: seconds ? Math.round(seconds / 60) : null, distanceKm: km ? r1(km) : null,
    gainM: e.gain, lossM: e.loss, avgHr: h.avg, maxHr: lapMax || h.max,
    track: trackOf(tps.map((t) => [num(tags(t, "LatitudeDegrees")[0]), num(tags(t, "LongitudeDegrees")[0])] as LatLon)),
  };
}

async function parseFitBuffer(buf: ArrayBuffer): Promise<ParsedActivity> {
  const { default: FitParser } = await import("fit-file-parser");
  const fit = await new FitParser({ force: true, mode: "list", lengthUnit: "m", speedUnit: "m/s" }).parseAsync(buf);
  const s = (fit.sessions ?? [])[0] as Record<string, unknown> | undefined;
  const records = (fit.records ?? []) as Record<string, unknown>[];
  if (!s && !records.length) throw new Error("Aucune activité dans ce fichier FIT.");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const start = s?.start_time ? new Date(s.start_time as string) : records[0]?.timestamp ? new Date(records[0].timestamp as string) : null;
  const meters = n(s?.total_distance) ?? n(records.at(-1)?.distance) ?? 0;
  const seconds = n(s?.total_timer_time) ?? n(s?.total_elapsed_time);
  let gain = n(s?.total_ascent), loss = n(s?.total_descent);
  if (gain == null || loss == null) {
    const e = elevation(records.map((r) => n(r.enhanced_altitude) ?? n(r.altitude) ?? NaN));
    gain ??= e.gain; loss ??= e.loss;
  }
  const h = hrStats(records.map((r) => n(r.heart_rate) ?? NaN));
  const km = meters / 1000;
  return {
    format: "FIT", date: start && !Number.isNaN(start.getTime()) ? ymd(start) : null, name: null,
    sport: sportFrom(String(s?.sport ?? ""), String(s?.sub_sport ?? ""), km ? gain / km : 0),
    durationMin: seconds ? Math.round(seconds / 60) : null, distanceKm: km ? r1(km) : null,
    gainM: Math.round(gain), lossM: Math.round(loss),
    avgHr: n(s?.avg_heart_rate) ?? h.avg, maxHr: n(s?.max_heart_rate) ?? h.max,
    track: trackOf(records.map((r) => [n(r.position_lat) ?? NaN, n(r.position_long) ?? NaN] as LatLon)),
    analysis: fitAnalysis(records),
  };
}

/** Flux seconde par seconde d’un fichier FIT (temps, cardio, vitesse, altitude, distance) → résumé d’analyse. */
function fitAnalysis(records: Record<string, unknown>[]): Analysis | null {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const t0 = records[0]?.timestamp ? new Date(records[0].timestamp as string).getTime() : NaN;
  if (!Number.isFinite(t0) || records.length < 120) return null;
  const time: number[] = [], hr: (number | null)[] = [], speed: (number | null)[] = [], altitude: (number | null)[] = [], distance: (number | null)[] = [];
  for (const r of records) {
    const t = r.timestamp ? (new Date(r.timestamp as string).getTime() - t0) / 1000 : NaN;
    if (!Number.isFinite(t) || (time.length && t <= time[time.length - 1])) continue;
    time.push(t); hr.push(n(r.heart_rate)); speed.push(n(r.enhanced_speed) ?? n(r.speed)); altitude.push(n(r.enhanced_altitude) ?? n(r.altitude)); distance.push(n(r.distance));
  }
  try { return analyze({ time, hr, speed, altitude, distance }); } catch { return null; }
}

export async function parseActivityFile(file: File): Promise<ParsedActivity> {
  const ext = file.name.toLowerCase().split(".").pop();
  if (file.size > 40 * 1024 * 1024) throw new Error("Fichier trop volumineux (40 Mo au plus).");
  if (ext === "fit") return parseFitBuffer(await file.arrayBuffer());
  const text = await file.text();
  if (ext === "tcx" || /<TrainingCenterDatabase/i.test(text.slice(0, 2000))) return parseTcxText(text);
  if (ext === "gpx" || /<gpx/i.test(text.slice(0, 2000))) return parseGpxText(text);
  throw new Error("Format non reconnu : importe un fichier FIT, TCX ou GPX.");
}

/**
 * Tracé d’une course (GPX ou TCX de parcours) : profil distance/altitude simplifié, D+ / D−,
 * et ravitaillements proposés à partir des points de passage nommés du fichier.
 */
export async function parseRouteFile(file: File) {
  const { simplifyProfile } = await import("./engine/strategy");
  if (file.size > 40 * 1024 * 1024) throw new Error("Fichier trop volumineux (40 Mo au plus).");
  const doc = parseXml(await file.text());
  const pts = [...tags(doc, "trkpt"), ...tags(doc, "rtept"), ...tags(doc, "Trackpoint")];
  if (pts.length < 2) throw new Error("Aucun tracé dans ce fichier. Importe le GPX du parcours fourni par l’organisation.");
  const coords: [number, number][] = [], profile: [number, number][] = [], eles: number[] = [];
  let dist = 0, prev: [number, number] | null = null, lastEle = NaN;
  for (const p of pts) {
    const lat = Number(p.getAttribute("lat") ?? tags(p, "LatitudeDegrees")[0]?.textContent);
    const lon = Number(p.getAttribute("lon") ?? tags(p, "LongitudeDegrees")[0]?.textContent);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const c: [number, number] = [lat, lon];
    if (prev) dist += haversine(prev, c);
    prev = c;
    const e = num(tags(p, "ele")[0] ?? tags(p, "AltitudeMeters")[0]);
    if (Number.isFinite(e)) lastEle = e;
    eles.push(lastEle);
    coords.push(c);
    profile.push([dist, Number.isFinite(lastEle) ? lastEle : 0]);
  }
  if (!Number.isFinite(lastEle)) throw new Error("Ce tracé n’a pas d’altitude : le profil ne peut pas être calculé.");
  const e = elevation(eles);
  // Points de passage nommés (ravitos, cols…) : rattachés au point du tracé le plus proche.
  const aid: { km: number; name: string }[] = [];
  for (const w of tags(doc, "wpt")) {
    const c: [number, number] = [Number(w.getAttribute("lat")), Number(w.getAttribute("lon"))];
    const name = tags(w, "name")[0]?.textContent?.trim() ?? "";
    if (!Number.isFinite(c[0]) || !name) continue;
    let best = Infinity, at = 0;
    for (let i = 0; i < coords.length; i += Math.max(1, Math.floor(coords.length / 4000))) {
      const d = haversine(c, coords[i]); if (d < best) { best = d; at = profile[i][0]; }
    }
    if (best < 0.3 && /ravit|aid|ravito|ravitaillement|refuge|base|water|eau|food/i.test(name)) aid.push({ km: Math.round(at * 10) / 10, name: name.slice(0, 40) });
  }
  aid.sort((a, b) => a.km - b.km);
  return {
    name: tags(doc, "name")[0]?.textContent?.trim().slice(0, 100) || null,
    points: simplifyProfile(profile), distanceKm: r1(dist), gainM: e.gain, lossM: e.loss, aid,
    line: trackOf(coords, 900),
  };
}
