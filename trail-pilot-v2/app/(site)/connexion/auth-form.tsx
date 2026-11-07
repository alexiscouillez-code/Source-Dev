"use client";

import { useState } from "react";

type Mode = "login" | "signup" | "forgot";

export default function AuthForm({ returnTo, initialMode }: { returnTo: string; initialMode: "login" | "signup" }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup", forgot = mode === "forgot";
  const go = (m: Mode) => { setMode(m); setError(null); setSent(null); };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch(`/api/auth/${forgot ? "forgot" : signup ? "signup" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.error ?? "Une erreur est survenue."); setBusy(false); return; }
      if (forgot) { setSent(body.message ?? "E-mail envoyé."); setBusy(false); return; }
      window.location.assign(returnTo);
    } catch {
      setError("Connexion impossible. Vérifie ton réseau."); setBusy(false);
    }
  }

  return (
    <div className="auth-box">
      <span className="kicker">{forgot ? "Mot de passe oublié" : signup ? "Nouveau compte" : "Bon retour"}</span>
      <h1>{forgot ? "On te renvoie un lien." : signup ? "Crée ton espace." : "Connecte-toi."}</h1>
      {!forgot && (
        <div className="auth-switch" role="tablist">
          <button type="button" role="tab" aria-selected={!signup} className={!signup ? "on" : ""} onClick={() => go("login")}>Connexion</button>
          <button type="button" role="tab" aria-selected={signup} className={signup ? "on" : ""} onClick={() => go("signup")}>Inscription</button>
        </div>
      )}
      {sent ? (
        <div className="auth-form">
          <p role="status" style={{ margin: 0, padding: "12px 14px", borderRadius: 12, border: "1px solid color-mix(in srgb, var(--ok) 45%, transparent)", background: "color-mix(in srgb, var(--ok) 10%, transparent)" }}>{sent}</p>
          <button type="button" className="btn" onClick={() => go("login")}>Revenir à la connexion</button>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-form">
          {forgot && <p style={{ margin: 0, opacity: .8 }}>Indique l’adresse de ton compte : tu recevras un lien pour choisir un nouveau mot de passe.</p>}
          {signup && <label>Prénom<input name="name" autoComplete="given-name" maxLength={80} /></label>}
          <label>E-mail<input name="email" type="email" required autoComplete="email" inputMode="email" /></label>
          {!forgot && (
            <label>Mot de passe
              <input name="password" type="password" required minLength={signup ? 10 : 1} autoComplete={signup ? "new-password" : "current-password"} />
              {signup && <small>10 caractères minimum.</small>}
            </label>
          )}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={busy}>{busy ? "Un instant…" : forgot ? "Recevoir le lien" : signup ? "Créer mon compte" : "Se connecter"} <span className="arr">↗</span></button>
          {mode === "login" && <button type="button" className="auth-link" onClick={() => go("forgot")} style={{ background: "none", border: 0, padding: 0, color: "inherit", opacity: .75, textDecoration: "underline", cursor: "pointer", justifySelf: "start", font: "inherit", fontSize: 14 }}>Mot de passe oublié ?</button>}
          {forgot && <button type="button" onClick={() => go("login")} style={{ background: "none", border: 0, padding: 0, color: "inherit", opacity: .75, textDecoration: "underline", cursor: "pointer", justifySelf: "start", font: "inherit", fontSize: 14 }}>Retour à la connexion</button>}
        </form>
      )}
    </div>
  );
}
