/** Lecture d’une trace GPX dans le navigateur : distance (km), D+ et D− lissés à 3 m, durée, date. */
export function parseGpx(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Fichier GPX illisible.");
  const pts = [...Array.from(doc.getElementsByTagName("trkpt")), ...Array.from(doc.getElementsByTagName("rtept"))];
  if (pts.length < 2) throw new Error("Aucun point de trace dans ce fichier.");
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  let dist = 0, gain = 0, loss = 0, ref: number | null = null, start: number | null = null, end: number | null = null;
  let prev: [number, number] | null = null;
  for (const p of pts) {
    const lat = Number(p.getAttribute("lat")), lon = Number(p.getAttribute("lon"));
    if (prev) {
      const dLat = rad(lat - prev[0]), dLon = rad(lon - prev[1]);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(prev[0])) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2;
      dist += 2 * R * Math.asin(Math.sqrt(a));
    }
    prev = [lat, lon];
    const e = Number(p.getElementsByTagName("ele")[0]?.textContent ?? NaN);
    if (!Number.isNaN(e)) {
      if (ref === null) ref = e;
      else if (Math.abs(e - ref) >= 3) { if (e > ref) gain += e - ref; else loss += ref - e; ref = e; }
    }
    const t = Date.parse(p.getElementsByTagName("time")[0]?.textContent ?? "");
    if (!Number.isNaN(t)) { start ??= t; end = t; }
  }
  const d = start != null ? new Date(start) : null;
  return {
    distanceKm: Math.round(dist * 10) / 10,
    gainM: Math.round(gain), lossM: Math.round(loss),
    durationMin: start != null && end != null && end > start ? Math.round((end - start) / 60000) : null,
    date: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null,
    name: doc.getElementsByTagName("name")[0]?.textContent?.trim() || null,
  };
}
