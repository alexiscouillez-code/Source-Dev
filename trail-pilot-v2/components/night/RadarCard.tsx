import GlassCard from "./GlassCard";
import { fmtKm1 } from "@/lib/engine/today-run";

/**
 * Carte radar (variante accent) : cercles concentriques, toi au centre, la cible placée dans sa direction et reliée en pointillés.
 * La distance au centre suit une échelle racine (proche = près du centre, 20 km et plus = bord).
 */
export default function RadarCard({ title, name, km, bearing, from, example, onOpen }: { title: string; name: string; km: number; bearing: number; from: string; example?: boolean; onOpen?: () => void }) {
  const S = 100, C = S / 2, Rmax = 40;
  const r = Math.min(Rmax, Math.max(10, Math.sqrt(Math.min(km, 20) / 20) * Rmax));
  const a = ((bearing - 90) * Math.PI) / 180;
  const tx = C + r * Math.cos(a), ty = C + r * Math.sin(a);
  const label = `${title} : ${name}, à ${fmtKm1(km)} kilomètres de ${from}${example ? " (exemple)" : ""}.`;
  const body = (
    <>
      <span className="g-row"><span className="g-top">{title}</span>{example && <span className="g-example">Exemple</span>}</span>
      <svg className="radar-dots" viewBox={`0 0 ${S} ${S}`} role="img" aria-label={label}>
        {[14, 27, 40].map((rr, i) => <circle key={rr} className="rd-ring" style={{ ["--i" as string]: i }} cx={C} cy={C} r={rr} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="0.6" />)}
        <circle className="rd-sweep" cx={C} cy={C} r={40} fill="none" stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" />
        <line className="rd-line" x1={C} y1={C} x2={tx} y2={ty} stroke="#fff" strokeOpacity="0.85" strokeWidth="1" strokeDasharray="2 2.4" />
        <circle className="rd-center" cx={C} cy={C} r={2.6} fill="#fff" />
        {/* La cible part du centre et glisse jusqu'à sa place (--dx / --dy : décalage depuis le centre). */}
        <g className="rd-target" style={{ ["--dx" as string]: `${(C - tx).toFixed(1)}px`, ["--dy" as string]: `${(C - ty).toFixed(1)}px` }}>
          <circle className="rd-ping" cx={tx} cy={ty} r={6} fill="#fff" opacity="0.25" />
          <circle cx={tx} cy={ty} r={3.4} fill="#fff" />
        </g>
      </svg>
      <span className="g-num g-num-sm" aria-hidden="true">{fmtKm1(km)}<small> KM</small></span>
      <span className="g-sub" aria-hidden="true">{name}</span>
    </>
  );
  return onOpen
    ? <GlassCard as="button" type="button" accent className="radar-card" onClick={onOpen} aria-label={`${label} Ouvrir les terrains.`}>{body}</GlassCard>
    : <GlassCard accent className="radar-card">{body}</GlassCard>;
}
