/** Deterministic unit in [0, 1). Same parts always return the same value. */
export function unitHash(parts: readonly string[]): number {
  let hash = 2166136261;
  const text = parts.join("|");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
