"use client";

import { useRef, useState } from "react";
import { api, type FuelDay, type Plate } from "./client";
import { PlateLegend, PlateRing, ProductsManager } from "./FuelKit";
import { shrinkPhoto } from "./photo";
import { Fiche, FicheHead, useFiche } from "./Fiche";
import { haptic } from "@/components/haptics";

const EXAMPLES: Record<keyof Plate, string> = {
  feculents: "pâtes, riz, pommes de terre, pain, semoule, lentilles",
  legumes: "crudités, légumes cuits, salade, fruits",
  proteines: "œufs, poisson, viande, tofu, yaourt",
};

interface PlateResult { read: Plate & { foods: string[] }; target: Plate; label: string; ok: boolean; text: string }

/**
 * Carburant du jour, sur l'accueil : après une grosse séance, de quoi récupérer dans l'heure ; puis l'assiette du jour
 * selon la charge (proportions, jamais de calories), une photo d'assiette pour vérifier, et les produits de course.
 */
export default function FuelCard({ fuel, today, toast }: { fuel: FuelDay; today: string; toast: (m: string) => void }) {
  const kit = useFiche<true>();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<PlateResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onPhoto(f: File | undefined) {
    if (!f) return;
    setBusy(true); setErr(null); setRes(null);
    try {
      const image = await shrinkPhoto(f);
      const r = await api<PlateResult>("/api/fuel/photo", { method: "POST", body: { mode: "plate", image, today } });
      setRes(r); haptic(r.ok ? "success" : "tap");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  }

  return (
    <section className={`card fuel-card is-${fuel.kind}`} aria-labelledby="fuel-title">
      <div className="card-head">
        <div><span className="eyebrow">Carburant du jour</span><h2 id="fuel-title" style={{ marginTop: 4 }}>{fuel.label}</h2></div>
        <button type="button" className="btn ghost sm" aria-haspopup="dialog" onClick={(e) => kit.open(true, e.currentTarget.closest<HTMLElement>(".fuel-card") ?? e.currentTarget)}>Mes produits</button>
      </div>

      {fuel.recovery && (
        <div className="fuel-rec" role="note">
          <b>{fuel.recovery.title}</b>
          <ul>{fuel.recovery.items.map((x) => <li key={x}>{x}</li>)}</ul>
          {fuel.recovery.next && <p className="small" style={{ margin: 0 }}>{fuel.recovery.next}</p>}
          <small>{fuel.recovery.why}</small>
        </div>
      )}

      <div className="fuel-plate">
        <PlateRing plate={fuel.plate} label={`Assiette du jour : ${fuel.plate.feculents} % de féculents, ${fuel.plate.legumes} % de légumes et fruits, ${fuel.plate.proteines} % de protéines`} />
        <div>
          <p className="small" style={{ margin: "0 0 8px" }}>{fuel.reason}</p>
          <PlateLegend plate={fuel.plate} examples={EXAMPLES} />
        </div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Plus une touche de bonnes graisses (huile d’olive, noix) et de l’eau à chaque repas. Ce sont des proportions, pas des quantités : mange à ta faim.</p>

      <div className="fuel-photo">
        <button type="button" className="btn ghost sm" disabled={busy} onClick={() => file.current?.click()}>{busy ? "Analyse de l’assiette…" : "Photo de mon assiette"}</button>
        <input ref={file} className="fk-file" type="file" accept="image/*" capture="environment" aria-label="Photo de mon assiette" onChange={(e) => onPhoto(e.target.files?.[0])} />
        {!res && !err && <small className="muted">Elle est comparée à l’assiette du jour, puis oubliée : rien n’est conservé.</small>}
      </div>
      {err && <p className="err small" role="alert">{err}</p>}
      {res && (
        <div className={`plate-res ${res.ok ? "is-ok" : "is-add"}`} aria-live="polite">
          <PlateRing plate={res.read} size={72} label={`Ton assiette : ${res.read.feculents} % de féculents, ${res.read.legumes} % de légumes et fruits, ${res.read.proteines} % de protéines`} />
          <div>
            <b>{res.text}</b>
            <small>Ton assiette : {res.read.feculents} % féculents · {res.read.legumes} % légumes · {res.read.proteines} % protéines{res.read.foods.length ? ` (${res.read.foods.join(", ")})` : ""}. Estimation à l’œil.</small>
          </div>
        </div>
      )}

      <Fiche ctl={kit} kind="fuel">
        {kit.value && <><FicheHead eyebrow="Ravitaillement" title="Mes produits de course" onClose={kit.close} /><div className="panel-body"><ProductsManager toast={toast} /></div></>}
      </Fiche>
    </section>
  );
}
