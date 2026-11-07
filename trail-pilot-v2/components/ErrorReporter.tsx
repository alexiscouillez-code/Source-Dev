"use client";

import { useEffect } from "react";

/** Envoie au serveur les erreurs JavaScript du navigateur (au plus 5 par page, sans doublon). */
export function reportError(err: unknown) {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err));
    const key = `${e.message}`.slice(0, 200);
    const w = window as Window & { __tpErrs?: Set<string> };
    w.__tpErrs ??= new Set();
    if (w.__tpErrs.has(key) || w.__tpErrs.size >= 5) return;
    w.__tpErrs.add(key);
    const body = JSON.stringify({ message: e.message, stack: e.stack, url: location.pathname + location.hash });
    if (!navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "application/json" }))) {
      fetch("/api/errors", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch { /* rien */ }
}

export default function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => { if (e.error || e.message) reportError(e.error ?? e.message); };
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
