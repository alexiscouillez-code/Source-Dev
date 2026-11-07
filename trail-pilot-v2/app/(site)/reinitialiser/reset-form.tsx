"use client";

import { useState } from "react";

export default function ResetForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(token ? null : "Ce lien est incomplet. Fais une nouvelle demande depuis la page de connexion.");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? ""), confirm = String(f.get("confirm") ?? "");
    if (password !== confirm) { setError("Les deux mots de passe ne sont pas identiques."); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Une erreur est survenue."); setBusy(false); return; }
      window.location.assign("/espace");
    } catch { setError("Connexion impossible. Vérifie ton réseau."); setBusy(false); }
  }

  return (
    <div className="auth-box">
      <span className="kicker">Mot de passe oublié</span>
      <h1>Choisis un nouveau mot de passe.</h1>
      <form onSubmit={submit} className="auth-form">
        <label>Nouveau mot de passe<input name="password" type="password" required minLength={10} autoComplete="new-password" /><small>10 caractères minimum.</small></label>
        <label>Confirme-le<input name="confirm" type="password" required minLength={10} autoComplete="new-password" /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy || !token}>{busy ? "Un instant…" : "Enregistrer et me connecter"} <span className="arr">↗</span></button>
        <a href="/connexion" style={{ fontSize: 14, opacity: .75 }}>Retour à la connexion</a>
      </form>
    </div>
  );
}
