/// <reference lib="webworker" />
import { searchTerrains, type SearchInput } from "@/lib/terrain/engine";
import { TerrainError } from "@/lib/terrain/finders";

/** Recherche de terrains hors du fil principal : la page reste fluide pendant le calcul. */
self.onmessage = async (e: MessageEvent<{ id: number; input: SearchInput }>) => {
  const { id, input } = e.data;
  try {
    self.postMessage({ id, ok: true, results: await searchTerrains(input) });
  } catch (err) {
    console.warn("Recherche de terrains", err);
    self.postMessage({ id, ok: false, error: err instanceof TerrainError ? err.message : "La recherche a échoué. Réessaie dans un instant." });
  }
};
