/** Compte à rebours façon tableau d’affichage : chaque caractère bascule sur sa propre tuile. */
export default function Flap({ days, className = "" }: { days: number; className?: string }) {
  const text = days > 0 ? String(days) : "";
  return (
    <span className={`flap ${className}`} role="text" aria-label={days > 0 ? `J moins ${days}` : "Jour J"}>
      <span className="flap-pre" aria-hidden="true">{days > 0 ? "J-" : "Jour J"}</span>
      {[...text].map((c, i) => <span key={`${i}${c}`} className="flap-d" aria-hidden="true" style={{ ["--i" as string]: i }}>{c}</span>)}
    </span>
  );
}
