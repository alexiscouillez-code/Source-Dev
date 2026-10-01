export function StatBar({
  label,
  value,
  invert = false,
}: {
  label: string;
  value: number;
  invert?: boolean;
}) {
  const shown = Math.max(0, Math.min(100, Math.round(value)));
  const critical = invert ? shown >= 88 : shown <= 18;
  const warn = invert ? shown >= 70 : shown <= 35;
  const bar = critical ? "bg-red-500" : warn ? "bg-amber-400" : "bg-cyan-400";
  const text = critical ? "text-red-400" : "text-zinc-200";

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className={text}>{shown}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${shown}%` }} />
      </div>
    </div>
  );
}
