"use client";

import { useEffect, useState } from "react";
import type { RaceResult } from "@/game/models/types";

export function CoachPanel({ result }: { result: RaceResult }) {
  const [message, setMessage] = useState("Vérification du coach…");
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/coach")
      .then((response) => response.json())
      .then((body: { available?: boolean; message?: string }) => {
        if (cancelled) return;
        setAvailable(Boolean(body.available));
        setMessage(body.message ?? "Coach IA indisponible : aucune clé API configurée.");
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable(false);
          setMessage("Coach IA indisponible : aucune clé API configurée.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function ask() {
    setLoading(true);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      const body = (await response.json()) as { message?: string };
      setMessage(body.message ?? "Le coach n’a pas répondu.");
    } catch {
      setMessage("Le coach n’a pas répondu.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-300">Coach IA</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{message}</p>
      {available ? (
        <button
          type="button"
          onClick={() => void ask()}
          disabled={loading}
          className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl border border-zinc-700 text-sm font-semibold"
        >
          {loading ? "Lecture…" : "Expliquer ce résultat"}
        </button>
      ) : null}
    </section>
  );
}
