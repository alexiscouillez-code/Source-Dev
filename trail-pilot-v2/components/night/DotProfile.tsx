import { dotHeights, fmtKm1, resample } from "@/lib/engine/today-run";

/**
 * Profil d'altitude en grille de points : une colonne par tronçon, d'autant plus haute que l'altitude.
 * Les points du haut de chaque colonne sont les plus lumineux ; le dernier point de la sortie est mis en avant.
 */
export default function DotProfile({ profile, km, cols = 40, rows = 12, label }: { profile: number[]; km: number; cols?: number; rows?: number; label?: string }) {
  const values = resample(profile, cols);
  const heights = dotHeights(values, rows);
  const G = 10, R = 1.9, W = cols * G, H = rows * G;
  const lo = Math.round(Math.min(...values)), hi = Math.round(Math.max(...values));
  const desc = label ?? `Profil d'altitude sur ${fmtKm1(km)} kilomètres, de ${lo} à ${hi} mètres d'altitude, arrivée à ${Math.round(values[values.length - 1])} mètres.`;
  const lastC = cols - 1, lastR = heights[lastC] - 1;
  return (
    <figure className="dotprofile">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc} preserveAspectRatio="xMidYMax meet">
        {heights.map((h, c) => Array.from({ length: h }, (_, r) => {
          // r = 0 en bas de la colonne. Le sommet de la colonne est le plus lumineux.
          const top = r === h - 1;
          const op = top ? 0.95 : 0.22 + 0.5 * (r / Math.max(1, h - 1));
          // --c / --r : colonne et rangée, pour faire monter le profil colonne par colonne (voir night.css).
          return <circle key={`${c}-${r}`} className="dp-dot" style={{ ["--c" as string]: c, ["--r" as string]: r }} cx={c * G + G / 2} cy={H - (r * G + G / 2)} r={R} fill="#fff" opacity={op.toFixed(2)} />;
        }))}
        <circle className="dp-glow" cx={lastC * G + G / 2} cy={H - (lastR * G + G / 2)} r={6} fill="#fff" opacity="0.25" />
        <circle className="dp-last" cx={lastC * G + G / 2} cy={H - (lastR * G + G / 2)} r={3.2} fill="#fff" />
      </svg>
      <figcaption className="dp-axis" aria-hidden="true"><span>0 KM</span><span>{fmtKm1(km)} KM</span></figcaption>
    </figure>
  );
}
