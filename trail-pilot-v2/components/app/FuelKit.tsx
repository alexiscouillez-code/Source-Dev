"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, fmtDur, type FuelProduct, type Plate, type ProductDraft } from "./client";
import { barcodeFrom, shrinkPhoto } from "./photo";
import { haptic } from "@/components/haptics";

/**
 * Ravitaillement : la liste des produits du coureur (ajoutés par photo, code-barres ou à la main), et ce qui a été
 * pris pendant une sortie (glucides par heure comparés à la cible). Partagé par la carte « Carburant du jour »
 * et la fiche d'un jour du planning.
 */

export const KIND_LABEL: Record<string, string> = { gel: "Gel", barre: "Barre", boisson: "Boisson", compote: "Compote", pate: "Pâte de fruits", solide: "Solide", autre: "Autre" };
const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

// ---------- Assiette (anneau en trois parts) ----------
const PARTS: { k: keyof Plate; label: string; cls: string }[] = [
  { k: "feculents", label: "Féculents", cls: "pl-carb" },
  { k: "legumes", label: "Légumes et fruits", cls: "pl-veg" },
  { k: "proteines", label: "Protéines", cls: "pl-prot" },
];
export function PlateRing({ plate, size = 112, label }: { plate: Plate; size?: number; label: string }) {
  const r = 40, c = 2 * Math.PI * r;
  let at = 0;
  return (
    <svg className="plate-ring" viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={label}>
      <circle cx="50" cy="50" r={r} className="pl-base" />
      {PARTS.map((p) => {
        const len = (plate[p.k] / 100) * c;
        const el = <circle key={p.k} cx="50" cy="50" r={r} className={`pl-arc ${p.cls}`} strokeDasharray={`${Math.max(0, len - 1.6)} ${c}`} strokeDashoffset={-at} transform="rotate(-90 50 50)" />;
        at += len;
        return el;
      })}
    </svg>
  );
}
export function PlateLegend({ plate, examples }: { plate: Plate; examples?: Record<keyof Plate, string> }) {
  return (
    <ul className="plate-legend">
      {PARTS.map((p) => (
        <li key={p.k} className={p.cls}><i aria-hidden="true" /><b>{plate[p.k]} %</b><span>{p.label}{examples && <small>{examples[p.k]}</small>}</span></li>
      ))}
    </ul>
  );
}

// ---------- Ajout d'un produit ----------
function ProductForm({ draft, source, onSaved, onCancel }: { draft: ProductDraft; source: "manuel" | "code" | "photo"; onSaved: (p: FuelProduct) => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: draft.name, brand: draft.brand ?? "", kind: draft.kind || "gel", carbs: draft.carbs != null ? fmt(draft.carbs) : "", sodium: draft.sodium != null ? String(Math.round(draft.sodium)) : "", caffeine: draft.caffeine != null ? String(Math.round(draft.caffeine)) : "", unit: draft.unit ?? "" });
  const [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null);
  const id = useId();
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api<{ product: FuelProduct }>("/api/fuel/products", { method: "POST", body: { source, product: { ...f, barcode: draft.barcode } } });
      haptic("success"); onSaved(r.product);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  return (
    <form className="form prod-form" onSubmit={save}>
      {source !== "manuel" && <p className="small soft" style={{ margin: 0 }}>{source === "photo" ? "Lu sur la photo : vérifie les chiffres avant d’enregistrer." : "Trouvé dans Open Food Facts : vérifie les chiffres avant d’enregistrer."}</p>}
      <label>Nom<input value={f.name} maxLength={60} required onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Gel citron" /></label>
      <div className="prod-form-row">
        <label>Marque<input value={f.brand} maxLength={40} onChange={(e) => setF({ ...f, brand: e.target.value })} /></label>
        <label>Type<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <div className="prod-form-row">
        <label htmlFor={`${id}-c`}>Glucides par unité<span className="unit-in"><input id={`${id}-c`} value={f.carbs} required inputMode="decimal" placeholder="25" onChange={(e) => setF({ ...f, carbs: e.target.value })} /><i>g</i></span></label>
        <label>Une unité, c’est<input value={f.unit} maxLength={30} placeholder="1 gel de 40 g" onChange={(e) => setF({ ...f, unit: e.target.value })} /></label>
      </div>
      <div className="prod-form-row">
        <label htmlFor={`${id}-s`}>Sodium<span className="unit-in"><input id={`${id}-s`} value={f.sodium} inputMode="numeric" placeholder="facultatif" onChange={(e) => setF({ ...f, sodium: e.target.value })} /><i>mg</i></span></label>
        <label htmlFor={`${id}-k`}>Caféine<span className="unit-in"><input id={`${id}-k`} value={f.caffeine} inputMode="numeric" placeholder="facultatif" onChange={(e) => setF({ ...f, caffeine: e.target.value })} /><i>mg</i></span></label>
      </div>
      {err && <p className="err small" role="alert">{err}</p>}
      <div className="row"><button className="btn sm" type="submit" disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer le produit"}</button><button className="btn ghost sm" type="button" onClick={onCancel}>Annuler</button></div>
    </form>
  );
}

const EMPTY: ProductDraft = { name: "", brand: null, kind: "gel", carbs: null, sodium: null, caffeine: null, unit: null, barcode: null };

/** Trois façons d'ajouter un produit : photo (code-barres lu sur place, sinon étiquette lue par l'IA), numéro du code-barres, saisie. */
export function ProductAdder({ onSaved, onCancel }: { onSaved: (p: FuelProduct) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<{ d: ProductDraft; source: "manuel" | "code" | "photo" } | null>(null);
  const [code, setCode] = useState(""), [codeOpen, setCodeOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null), [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const lookup = async (c: string) => {
    try { return (await api<{ draft: ProductDraft }>(`/api/fuel/lookup?code=${encodeURIComponent(c)}`)).draft; } catch (x) { return x as Error; }
  };
  async function byCode(c: string) {
    setBusy("Recherche du produit…"); setErr(null);
    const r = await lookup(c);
    setBusy(null);
    if (r instanceof Error) setErr(r.message); else setDraft({ d: r, source: "code" });
  }
  async function onPhoto(f: File | undefined) {
    if (!f) return;
    setErr(null);
    // Code-barres lisible sur la photo : la fiche vient de la base (plus sûr qu'une lecture d'étiquette) ;
    // produit absent de la base : on lit l'étiquette.
    const c = await barcodeFrom(f);
    if (c) {
      setBusy("Recherche du produit…");
      const r = await lookup(c);
      if (!(r instanceof Error)) { setBusy(null); setDraft({ d: r, source: "code" }); if (file.current) file.current.value = ""; return; }
    }
    setBusy("Lecture de l’étiquette…");
    try {
      const image = await shrinkPhoto(f);
      const r = await api<{ draft: ProductDraft }>("/api/fuel/photo", { method: "POST", body: { mode: "label", image } });
      setDraft({ d: r.draft, source: "photo" });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(null); if (file.current) file.current.value = ""; }
  }

  if (draft) return <ProductForm draft={draft.d} source={draft.source} onSaved={(p) => { setDraft(null); setCode(""); setCodeOpen(false); onSaved(p); }} onCancel={() => setDraft(null)} />;
  return (
    <div className="prod-add">
      <div className="prod-add-btns">
        <button type="button" className="btn sm" disabled={!!busy} onClick={() => file.current?.click()}>Photo du produit</button>
        <button type="button" className="btn ghost sm" disabled={!!busy} aria-expanded={codeOpen} onClick={() => setCodeOpen(!codeOpen)}>Code-barres</button>
        <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => setDraft({ d: EMPTY, source: "manuel" })}>À la main</button>
        {onCancel && <button type="button" className="link small" onClick={onCancel}>Fermer</button>}
      </div>
      <input ref={file} className="fk-file" type="file" accept="image/*" capture="environment" aria-label="Photo du produit" onChange={(e) => onPhoto(e.target.files?.[0])} />
      {codeOpen && (
        <form className="row prod-code" onSubmit={(e) => { e.preventDefault(); byCode(code); }}>
          <input value={code} inputMode="numeric" pattern="[0-9 ]{8,17}" maxLength={17} placeholder="Chiffres sous le code-barres" aria-label="Numéro du code-barres" onChange={(e) => setCode(e.target.value)} />
          <button className="btn sm" type="submit" disabled={!!busy || code.replace(/\D/g, "").length < 8}>Chercher</button>
        </form>
      )}
      <p className="muted small" style={{ margin: 0 }}>{busy ?? "Photo : le code-barres ou l’étiquette des valeurs nutritionnelles. La photo est lue puis oubliée, rien n’est conservé."}</p>
      {err && <p className="err small" role="alert">{err}</p>}
    </div>
  );
}

/** Mes produits de course : la liste, et l'ajout. */
export function ProductsManager({ toast }: { toast: (m: string) => void }) {
  const [list, setList] = useState<FuelProduct[] | null>(null);
  const [adding, setAdding] = useState(false);
  const load = useCallback(() => api<{ products: FuelProduct[] }>("/api/fuel/products").then((r) => setList(r.products)).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  async function remove(p: FuelProduct) {
    try { await api(`/api/fuel/products?id=${p.id}`, { method: "DELETE" }); setList((l) => l?.filter((x) => x.id !== p.id) ?? null); toast(`${p.name} retiré de tes produits.`); }
    catch (e) { toast((e as Error).message); }
  }
  return (
    <div className="prod-manager">
      <p className="soft small" style={{ margin: 0 }}>Les gels, barres et boissons que tu emportes. Après une sortie longue, tu notes combien tu en as pris : l’appli calcule tes glucides par heure et les compare à la cible.</p>
      {list == null ? <div className="skeleton" style={{ height: 90 }} /> : list.length ? (
        <ul className="prod-list">
          {list.map((p) => (
            <li key={p.id} className="prod-row">
              <span className="prod-kind">{KIND_LABEL[p.kind] ?? "Autre"}</span>
              <div><b>{p.name}</b><small>{[p.brand, p.unit].filter(Boolean).join(" · ")}</small></div>
              <span className="prod-carbs"><b>{fmt(p.carbs)}</b> g<small>{[p.sodium ? `${Math.round(p.sodium)} mg Na` : null, p.caffeine ? `${Math.round(p.caffeine)} mg caféine` : null].filter(Boolean).join(" · ")}</small></span>
              <button type="button" className="iconbtn sm" aria-label={`Retirer ${p.name}`} onClick={() => remove(p)}>×</button>
            </li>
          ))}
        </ul>
      ) : <p className="empty small">Aucun produit pour l’instant : ajoute ceux que tu prendras le jour J pour les tester à l’entraînement.</p>}
      {adding ? <ProductAdder onSaved={(p) => { setAdding(false); setList((l) => [...(l ?? []).filter((x) => x.id !== p.id), p]); toast(`${p.name} ajouté.`); }} onCancel={() => setAdding(false)} />
        : <button type="button" className="btn sm" onClick={() => setAdding(true)}>Ajouter un produit</button>}
    </div>
  );
}

// ---------- Prises pendant une sortie ----------
interface Intake { date: string; items: { productId: number; name: string; carbs: number; qty: number }[]; carbs: number; minutes: number | null; gPerHour: number | null; target: number | null; compare: { verdict: string; text: string } | null }

/** Après une sortie de 75 min et plus : combien de chaque produit, glucides par heure et comparaison à la cible. */
export function IntakeLogger({ date, today, toast, onSaved }: { date: string; today: string; toast?: (m: string) => void; onSaved?: () => void }) {
  const [products, setProducts] = useState<FuelProduct[] | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [adding, setAdding] = useState(false), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  useEffect(() => {
    Promise.all([api<{ products: FuelProduct[] }>("/api/fuel/products"), api<Intake>(`/api/fuel/intake?date=${date}`)]).then(([p, i]) => {
      setProducts(p.products); setIntake(i);
      setQty(Object.fromEntries(i.items.map((x) => [x.productId, x.qty])));
    }).catch(() => setProducts([]));
  }, [date]);
  if (!products || !intake) return <div className="skeleton" style={{ height: 80 }} />;
  // Produits retirés depuis : ils restent affichés tant qu'ils comptent dans la sortie.
  const rows: { id: number; name: string; carbs: number; unit?: string | null }[] = [
    ...products.map((p) => ({ id: p.id, name: p.name, carbs: p.carbs, unit: p.unit })),
    ...intake.items.filter((x) => !products.some((p) => p.id === x.productId)).map((x) => ({ id: x.productId, name: x.name, carbs: x.carbs })),
  ];
  const carbs = rows.reduce((t, r) => t + r.carbs * (qty[r.id] ?? 0), 0);
  const h = intake.minutes ? Math.max(0.5, intake.minutes / 60 - 0.5) : null;
  const gph = h ? Math.round(carbs / h) : null;
  const set = (id: number, v: number) => { setQty({ ...qty, [id]: Math.max(0, Math.min(40, v)) }); setDirty(true); };
  async function save() {
    setBusy(true);
    try {
      const r = await api<Intake>("/api/fuel/intake", { method: "PUT", body: { date, today, items: Object.entries(qty).filter(([, q]) => q > 0).map(([productId, q]) => ({ productId: Number(productId), qty: q })) } });
      setIntake(r); setDirty(false); haptic("success");
      toast?.(r.compare ? r.compare.text : "Prises enregistrées.");
      onSaved?.();
    } catch (e) { toast?.((e as Error).message); } finally { setBusy(false); }
  }
  const verdict = gph != null && intake.target ? (gph < intake.target * 0.85 ? "en-dessous" : gph > intake.target * 1.15 ? "au-dessus" : "dans-cible") : null;
  return (
    <div className="intake">
      <div className="row between"><small className="cal-kicker">Ce que tu as pris pendant la sortie</small>{intake.minutes && <small className="muted">{fmtDur(intake.minutes)}</small>}</div>
      {rows.length ? (
        <ul className="intake-list">
          {rows.map((r) => (
            <li key={r.id}>
              <div><b>{r.name}</b><small>{fmt(r.carbs)} g de glucides{r.unit ? ` · ${r.unit}` : ""}</small></div>
              <div className="stepper" role="group" aria-label={`Quantité de ${r.name}`}>
                <button type="button" aria-label={`Un de moins : ${r.name}`} onClick={() => set(r.id, (qty[r.id] ?? 0) - 1)} disabled={!(qty[r.id] > 0)}>−</button>
                <output aria-live="polite">{fmt(qty[r.id] ?? 0)}</output>
                <button type="button" aria-label={`Un de plus : ${r.name}`} onClick={() => set(r.id, (qty[r.id] ?? 0) + 1)}>+</button>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="small soft" style={{ margin: 0 }}>Ajoute d’abord les produits que tu as emportés.</p>}
      {adding ? <ProductAdder onSaved={(p) => { setAdding(false); setProducts([...products.filter((x) => x.id !== p.id), p]); }} onCancel={() => setAdding(false)} />
        : <button type="button" className="link small" onClick={() => setAdding(true)}>+ Ajouter un produit</button>}
      {rows.length > 0 && (
        <div className={`intake-sum${verdict ? ` is-${verdict}` : ""}`}>
          <div><b>{Math.round(carbs)} g</b><small>glucides</small></div>
          <div><b>{gph ?? "–"}{gph != null && <i> g/h</i>}</b><small>dès la 30e minute</small></div>
          <div><b>{intake.target ?? "–"}{intake.target != null && <i> g/h</i>}</b><small>cible du jour</small></div>
        </div>
      )}
      {!dirty && intake.compare && <p className="small" style={{ margin: 0 }}>{intake.compare.text}</p>}
      {rows.length > 0 && (dirty || !intake.items.length) && <button type="button" className="btn sm" disabled={busy || !dirty} onClick={save}>{busy ? "Enregistrement…" : "Enregistrer mes prises"}</button>}
    </div>
  );
}
