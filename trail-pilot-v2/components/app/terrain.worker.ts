/// <reference lib="webworker" />
import { searchTerrains, type SearchInput } from "@/lib/terrain/engine";
import { TerrainError } from "@/lib/terrain/finders";

/** Recherche de terrains hors du fil principal : la page reste fluide pendant le calcul. */
self.onmessage = async (e: MessageEvent<{ id: number; input: SearchInput }>) => {
  const { id, input } = e.data;
  try {
    const t0 = performance.now();
    const results = await searchTerrains(input, (step) => self.postMessage({ id, progress: step }));
    console.info(`Recherche de terrains : ${Math.round(performance.now() - t0)} ms`);
    self.postMessage({ id, ok: true, results });
  } catch (err) {
    console.warn("Recherche de terrains", err);
    self.postMessage({ id, ok: false, error: err instanceof TerrainError ? err.message : "La recherche a échoué. Réessaie dans un instant." });
  }
};
