/**
 * Pourcentage en grille de 10 × 10 points : un point plein par pour-cent atteint, des points creux pour le reste.
 * Au-delà de 100 %, la grille est pleine et c'est le texte qui donne la valeur.
 */
export default function DotGrid({ pct, label }: { pct: number; label: string }) {
  const filled = Math.max(0, Math.min(100, Math.round(pct)));
  const G = 10, R = 3;
  return (
    <svg className="dotgrid" viewBox={`0 0 ${G * 10} ${G * 10}`} role="img" aria-label={label}>
      {Array.from({ length: 100 }, (_, i) => {
        // Remplissage ligne par ligne en partant du bas, de gauche à droite.
        const row = 9 - Math.floor(i / 10), col = i % 10, on = i < filled;
        // --i : ordre de remplissage, pour allumer les points un à un (voir night.css).
        const st = { ["--i" as string]: i };
        return on
          ? <circle key={i} className="dg-on" style={st} cx={col * G + G / 2} cy={row * G + G / 2} r={R} fill="#fff" />
          : <circle key={i} className="dg-off" style={st} cx={col * G + G / 2} cy={row * G + G / 2} r={R - 0.6} fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.1" />;
      })}
    </svg>
  );
}
