"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "./client";

interface Msg { role: "user" | "assistant"; content: string; at: number }
const IDEAS = [
  "Je peux décaler ma sortie longue à samedi ?",
  "Je suis fatigué ce matin, je fais quoi aujourd’hui ?",
  "Que manger pendant ma sortie longue ?",
  "Comment progresser en descente ?",
];

/** Coach IA : questions libres, réponses appuyées sur ton plan, ta charge et ton check-in. */
export default function Coach({ toast }: { toast: (m: string) => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { api<{ enabled: boolean; messages: Msg[] }>("/api/coach").then((r) => { setEnabled(r.enabled); setMsgs(r.messages); }).catch(() => setEnabled(false)); }, []);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true); setErr(null); setQ("");
    setMsgs((m) => [...m, { role: "user", content: message, at: Date.now() }]);
    try {
      const r = await api<{ reply: string }>("/api/coach", { method: "POST", body: { message } });
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, at: Date.now() }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
      setMsgs((m) => m.slice(0, -1)); setQ(message);
    } finally { setBusy(false); }
  }
  async function clear() {
    if (!confirm("Effacer la conversation avec le coach ?")) return;
    try { await api("/api/coach", { method: "DELETE" }); setMsgs([]); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }

  if (enabled === null) return null;
  return (
    <section className="card coach" style={{ marginTop: 14 }} aria-labelledby="coach-title">
      <div className="card-head">
        <div><span className="eyebrow">Une question ?</span><h2 id="coach-title" style={{ marginTop: 4 }}>Ton coach</h2></div>
        {msgs.length > 0 && <button className="link small" onClick={clear}>Effacer</button>}
      </div>
      {!enabled ? (
        <p className="muted" style={{ margin: 0 }}>Le coach IA n’est pas encore activé sur le site.</p>
      ) : (
        <>
          {msgs.length > 0 ? (
            <div className="coach-log" ref={box} aria-live="polite">
              {msgs.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
              {busy && <div className="bubble assistant typing" aria-label="Le coach écrit"><i /><i /><i /></div>}
            </div>
          ) : (
            <div className="coach-ideas">
              <p className="soft small" style={{ margin: 0 }}>Pose ta question : le coach connaît ton plan, ta charge, ton check-in et tes dernières sorties.</p>
              <div className="zchips">{IDEAS.map((t) => <button key={t} type="button" onClick={() => send(t)} disabled={busy}>{t}</button>)}</div>
              {busy && <div className="bubble assistant typing" aria-label="Le coach écrit"><i /><i /><i /></div>}
            </div>
          )}
          {err && <p className="note err" role="alert" style={{ margin: 0 }}>{err}</p>}
          <form className="coach-form" onSubmit={(e) => { e.preventDefault(); send(q); }}>
            <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={1} maxLength={1000} placeholder="Ex. : j’ai une gêne au genou, je cours demain ?" aria-label="Ta question"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(q); } }} />
            <button className="btn" type="submit" disabled={busy || !q.trim()}>{busy ? "…" : "Envoyer"}</button>
          </form>
          <p className="muted" style={{ margin: 0, fontSize: 11.5 }}>Réponses générées par une IA à partir de tes données Trail Pilot : vérifie ce qui compte et, pour toute douleur qui dure, consulte un professionnel de santé.</p>
        </>
      )}
    </section>
  );
}
