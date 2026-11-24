/**
 * Position du soleil, sans dépendance : hauteur au-dessus de l'horizon (en degrés) pour un lieu et un instant,
 * et prochain lever ou coucher. Formules simplifiées de l'almanach (précision de l'ordre de la minute),
 * largement suffisantes pour passer l'appli en mode nuit au coucher du soleil.
 *
 * Le même calcul est recopié, compacté, dans le script de démarrage du layout racine (avant l'affichage) :
 * garder les deux en accord (voir SUN_INLINE plus bas, testé contre sunAltitude).
 */
const RAD = Math.PI / 180;
/** Hauteur du centre du soleil au lever et au coucher (réfraction et demi-diamètre compris). */
export const HORIZON = -0.833;

export function sunAltitude(t: number, lat: number, lon: number): number {
  const d = t / 864e5 - 10957.5; // jours depuis J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 3.6e-7 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const h = ((18.697374558 + 24.06570982441908 * d) * 15 + lon) * RAD - ra;
  return Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(h)) / RAD;
}

export const sunUp = (t: number, lat: number, lon: number) => sunAltitude(t, lat, lon) > HORIZON;

/**
 * Prochain changement (lever ou coucher) après `t`, cherché sur 48 h par pas de 10 minutes puis affiné à la seconde.
 * null aux pôles en plein jour ou pleine nuit polaire.
 */
export function nextSunChange(t: number, lat: number, lon: number): { at: number; rise: boolean } | null {
  const up = sunUp(t, lat, lon), step = 600000;
  for (let a = t, b = t + step; b <= t + 48 * 3600000; a = b, b += step) {
    if (sunUp(b, lat, lon) === up) continue;
    let lo = a, hi = b;
    while (hi - lo > 1000) { const m = (lo + hi) / 2; if (sunUp(m, lat, lon) === up) lo = m; else hi = m; }
    return { at: Math.round(hi), rise: !up };
  }
  return null;
}

/** Version compacte pour le script de démarrage (mêmes formules). Argument : (lat, lon) ; renvoie la hauteur en degrés. */
export const SUN_INLINE =
  "function(la,lo){var r=Math.PI/180,d=Date.now()/864e5-10957.5,g=(357.529+.98560028*d)*r,q=280.459+.98564736*d,L=(q+1.915*Math.sin(g)+.02*Math.sin(2*g))*r,e=(23.439-3.6e-7*d)*r,ra=Math.atan2(Math.cos(e)*Math.sin(L),Math.cos(L)),dc=Math.asin(Math.sin(e)*Math.sin(L)),h=((18.697374558+24.06570982441908*d)*15+lo)*r-ra;return Math.asin(Math.sin(la*r)*Math.sin(dc)+Math.cos(la*r)*Math.cos(dc)*Math.cos(h))/r}";

/**
 * Hauteur et azimut du soleil (degrés ; azimut compté depuis le nord, dans le sens des aiguilles d'une montre).
 * Sert à éclairer le fond d'herbes comme dehors : soleil bas et doré le matin et le soir, haut à midi.
 */
export function sunPosition(t: number, lat: number, lon: number): { alt: number; az: number } {
  const d = t / 864e5 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 3.6e-7 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const h = ((18.697374558 + 24.06570982441908 * d) * 15 + lon) * RAD - ra;
  const phi = lat * RAD;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h)) / RAD;
  const az = (Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / RAD + 540) % 360;
  return { alt, az };
}
