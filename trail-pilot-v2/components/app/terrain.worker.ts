/// <reference lib="webworker" />
import { searchTerrains, type SearchInput } from "@/lib/terrain/engine";
import { TerrainError } from "@/lib/terrain/finders";

/** Recherche de terrains hors du fil principal : la page reste fluide pendant le calcul. */
self.onmessage = async (e: MessageEvent<SearchInput>) => {
  try {
    self.postMessage({ ok: true, results: await searchTerrains(e.data) });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof TerrainError ? err.message : "La recherche a échoué. Réessaie dans un instant." });
  }
};
