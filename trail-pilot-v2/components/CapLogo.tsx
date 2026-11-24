/**
 * Logo « Le cap » : une aiguille de boussole dont la pointe est un sommet, dans un cadran pointillé.
 * Toujours en mouvement (cap.css) : le cadran tourne lentement, l'aiguille cherche le nord, oscille puis se
 * stabilise, et ne s'arrête jamais tout à fait (léger frémissement). Couleurs fixes de la marque.
 */
export default function CapLogo({ className = "", title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={`cap ${className}`} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect className="cap-bg" width="512" height="512" rx="112" fill="#1b2631" />
      <g className="cap-dial">
        <circle cx="256" cy="256" r="190" fill="none" stroke="#f4efe6" strokeOpacity=".35" strokeWidth="10" strokeLinecap="round" strokeDasharray="0 30" />
        <circle cx="256" cy="66" r="11" fill="#f4efe6" fillOpacity=".7" />
      </g>
      <g className="cap-needle">
        <g className="cap-tremble">
          <path d="M256 86 L334 256 H178 Z" fill="#ff6a2b" stroke="#ff6a2b" strokeWidth="8" strokeLinejoin="round" />
          <path className="cap-tip" d="M256 86 L292 166 H220 Z" fill="#ffb38a" />
          <path d="M178 256 H334 L256 426 Z" fill="#f4efe6" fillOpacity=".24" />
        </g>
      </g>
      <circle cx="256" cy="256" r="17" fill="#1b2631" stroke="#f4efe6" strokeWidth="8" />
    </svg>
  );
}
