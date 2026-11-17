/**
 * Masques SVG partagés de la charte pointillée du mode Verre (voir glass-theme.css) : un aplat masqué par
 * « url(#tp-dots) » garde sa couleur mais n'apparaît qu'à travers une trame de points.
 * #tp-dots : graphiques de 100 à 360 unités de large ; #tp-dots-l : graphiques de 720 unités.
 */
export default function DotDefs() {
  const big = { x: -5000, y: -5000, width: 10000, height: 10000 };
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
      <defs>
        <pattern id="tp-dot-p" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="2" fill="#fff" /></pattern>
        <pattern id="tp-dot-pl" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="4" fill="#fff" /></pattern>
        <mask id="tp-dots" maskUnits="userSpaceOnUse" {...big}><rect {...big} fill="url(#tp-dot-p)" /></mask>
        <mask id="tp-dots-l" maskUnits="userSpaceOnUse" {...big}><rect {...big} fill="url(#tp-dot-pl)" /></mask>
      </defs>
    </svg>
  );
}
