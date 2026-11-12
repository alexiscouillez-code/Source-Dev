"use client";

import { useState } from "react";
import { api } from "./client";
import Fold from "./Fold";

export interface GearItem { label: string; checked: boolean }

/** Le matériel le plus souvent imposé sur les trails en montagne : à ajouter d’un geste, puis à ajuster au règlement. */
export const GEAR_SUGGESTIONS = [
  "Réserve d’eau 1 L minimum", "Gobelet personnel", "Réserve alimentaire", "Couverture de survie", "Sifflet",
  "Veste imperméable avec capuche", "Pantalon ou collant long", "Couche chaude à manches longues", "Bonnet ou buff", "Gants",
  "Lampe frontale et piles de rechange", "Téléphone chargé", "Bande élastique (strap)", "Pièce d’identité", "Dossard et épingles", "Bâtons",
];

/**
 * Matériel obligatoire de la course : à saisir une fois d’après le règlement, à cocher la veille en faisant le sac.
 * Il apparaît aussi sur la fiche de course imprimable.
 */
export default function GearList({ items: initial, daysTo, toast }: { items: GearItem[]; daysTo: number; toast: (m: string) => void }) {
  const [items, setItems] = useState(initial);
  const [add, setAdd] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState(!initial.length);
  async function save(next: GearItem[], msg?: string) {
    const prev = items; setItems(next); setBusy(true);
    try { setItems((await api<{ items: GearItem[] }>("/api/goal/gear", { method: "PUT", body: { items: next } })).items); if (msg) toast(msg); }
    catch (e) { setItems(prev); toast(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }
  const has = (l: string) => items.some((x) => x.label.toLowerCase() === l.toLowerCase());
  const ready = items.filter((x) => x.checked).length;
  const soon = daysTo <= 2;
  return (
    <Fold id="plan-gear" style={{ marginTop: 14 }} title="Matériel obligatoire" defaultOpen={soon}
      aside={<span className={`chip ${items.length && ready === items.length ? "ok" : soon && items.length ? "lite" : "dim"}`}>{items.length ? `${ready}/${items.length} prêt${ready > 1 ? "s" : ""}` : "À compléter"}</span>}>
      <p className="soft small" style={{ margin: 0 }}>Recopie la liste du règlement de ta course : elle est souvent contrôlée au retrait du dossard ou en course. La veille, coche chaque objet en faisant ton sac. Elle figure aussi sur ta fiche de course.</p>
      {items.length > 0 && (
        <ul className="gear-list">
          {items.map((x, i) => (
            <li key={x.label} className={x.checked ? "on" : ""}>
              <label><input type="checkbox" checked={x.checked} disabled={busy} onChange={() => save(items.map((y, k) => (k === i ? { ...y, checked: !y.checked } : y)))} /><span>{x.label}</span></label>
              <button className="iconbtn" aria-label={`Retirer ${x.label}`} disabled={busy} onClick={() => save(items.filter((_, k) => k !== i))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); const l = add.trim(); if (!l) return; if (has(l)) { toast("Déjà dans la liste."); return; } save([...items, { label: l, checked: false }]); setAdd(""); }}>
        <input value={add} onChange={(e) => setAdd(e.target.value)} maxLength={60} placeholder="Ajouter un objet" aria-label="Ajouter un objet" style={{ flex: 1, minWidth: 0 }} />
        <button className="btn sm" disabled={busy || !add.trim()}>Ajouter</button>
      </form>
      <div className="row" style={{ gap: 8 }}>
        <button className="link small" aria-expanded={suggest} onClick={() => setSuggest(!suggest)}>{suggest ? "Masquer les suggestions" : "Suggestions courantes"}</button>
        {ready > 0 && <button className="link small" disabled={busy} onClick={() => save(items.map((y) => ({ ...y, checked: false })), "Cases décochées : prêt pour refaire le sac.")}>Tout décocher</button>}
      </div>
      {suggest && (
        <div className="db-tags" aria-label="Suggestions de matériel">
          {GEAR_SUGGESTIONS.filter((l) => !has(l)).map((l) => <button key={l} type="button" className="db-tag" disabled={busy} onClick={() => save([...items, { label: l, checked: false }])}>+ {l}</button>)}
        </div>
      )}
    </Fold>
  );
}
