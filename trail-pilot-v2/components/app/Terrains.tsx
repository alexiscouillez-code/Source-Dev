"use client";

import dynamic from "next/dynamic";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { api, dayLabel, fmtDur, fmtKm, fmtNum, PRESET_KEY, type Targets } from "./client";
import type { Ctx } from "./AppShell";
import type { MapLine, MapMarker } from "./TrackMap";
import { IconPin, IconTrash } from "./icons";
import { decodePolyline } from "@/lib/polyline";
import { dist } from "@/lib/terrain/graph";
import type { Kind, Surface, Terrain } from "@/lib/terrain/finders";
import type { SearchInput } from "@/lib/terrain/engine";

const TrackMap = dynamic(() => import("./TrackMap"), { ssr: false, loading: () => <div className="tmap" style={{ height: 360 }}><div className="tmap-loading">Chargement de la carte…</div></div> });

type Saved = Terrain & { savedId: number; note: string | null; savedAt: number };
interface Start { name: string; lat: number; lon: number }
type Relief = "plat" | "vallonne" | "montagne" | "precis";
type Len = "court" | "moyen" | "long";
type Slope = "douce" | "moyenne" | "raide";
interface Query { kind: Kind; distanceKm: string; relief: Relief; gainM: string; surface: Surface; len: Len; slope: Slope; radiusKm: number }
interface Preset { title: string; date: string; template: string; durationMin: number; gainM: number | null }

const START_KEY = "tp-terrain-start";

const KIND_LABEL: Record<Kind, string> = { loop: "Boucle", climb: "Côte", descent: "Descente", track: "Piste", stairs: "Escaliers", fitness: "Agrès", water: "Point d’eau" };
const KIND_HINT: Record<Kind, string> = {
  loop: "Une boucle qui revient au départ, à la distance et au relief voulus.",
  climb: "Une montée régulière pour les côtes, le fractionné en montée ou les longues ascensions.",
  descent: "Une descente pour travailler la technique et préparer les cuisses.",
  track: "Une piste d’athlétisme pour la VMA et les allures précises.",
  stairs: "Des escaliers pour le renforcement et les montées courtes.",
  fitness: "Un parcours santé ou des agrès de plein air pour le renforcement.",
  water: "Les points d’eau potable pour remplir les gourdes en route.",
};
const RELIEF: Record<Exclude<Relief, "precis">, { label: string; perKm: number }> = { plat: { label: "Plat", perKm: 10 }, vallonne: { label: "Vallonné", perKm: 30 }, montagne: { label: "Montagne", perKm: 70 } };
const LEN: Record<Len, { label: string; sub: string; min: number; max: number }> = {
  court: { label: "Courte", sub: "100–300 m", min: 100, max: 300 }, moyen: { label: "Moyenne", sub: "300–800 m", min: 300, max: 800 }, long: { label: "Longue", sub: "0,8–3 km", min: 800, max: 3000 },
};
const SLOPE: Record<"climb" | "descent", Record<Slope, { label: string; min: number; max: number }>> = {
  climb: { douce: { label: "Douce", min: 4, max: 7 }, moyenne: { label: "Moyenne", min: 7, max: 12 }, raide: { label: "Raide", min: 12, max: 25 } },
  descent: { douce: { label: "Roulante", min: 5, max: 10 }, moyenne: { label: "Technique", min: 10, max: 20 }, raide: { label: "Raide", min: 20, max: 40 } },
};
const DEFAULT_Q: Query = { kind: "loop", distanceKm: "10", relief: "vallonne", gainM: "", surface: "trail", len: "moyen", slope: "moyenne", radiusKm: 3 };

const read = <T,>(k: string, store: "local" | "session" = "local"): T | null => { try { const v = (store === "local" ? localStorage : sessionStorage).getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } };

/** Réglages de recherche tirés d’une séance du planning. */
function fromPreset(p: Preset, targets: Targets): Partial<Query> {
  const pace = (k: "E" | "T") => { const x = targets.paces.find((y) => y.key === k); return x ? (x.fast + x.slow) / 2 : k === "E" ? 400 : 300; };
  const km = (min: number, k: "E" | "T" = "E") => (min * 60) / pace(k);
  switch (p.template) {
    case "long": case "b2b": case "test": {
      const gain = p.gainM ?? 0;
      const d = Math.max(4, Math.round(km(p.durationMin) - gain / 100));
      return { kind: "loop", distanceKm: String(d), relief: gain ? "precis" : "vallonne", gainM: gain ? String(gain) : "", surface: "trail" };
    }
    case "easy": return { kind: "loop", distanceKm: String(Math.max(3, Math.round(km(p.durationMin)))), relief: "plat", surface: "trail" };
    case "hills": return { kind: "climb", len: "court", slope: "moyenne", radiusKm: 3 };
    case "climb": return { kind: "climb", len: "long", slope: "moyenne", radiusKm: 5 };
    case "downhill": return { kind: "descent", len: "moyen", slope: "moyenne", radiusKm: 4 };
    case "tempo": case "sharpen": return { kind: "track", radiusKm: 5 };
    case "strength": return { kind: "fitness", radiusKm: 3 };
    default: return { kind: "loop", distanceKm: String(Math.max(3, Math.round(km(p.durationMin)))) };
  }
}

function gpx(t: Terrain) {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" })[c]!);
  const body = t.poly
    ? `<trk><name>${esc(t.name)}</name><trkseg>${decodePolyline(t.poly).map(([a, b]) => `<trkpt lat="${a.toFixed(6)}" lon="${b.toFixed(6)}"/>`).join("")}</trkseg></trk>`
    : `<wpt lat="${t.lat.toFixed(6)}" lon="${t.lon.toFixed(6)}"><name>${esc(t.name)}</name></wpt>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Trail Pilot" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${esc(t.name)}</name></metadata>${body}</gpx>\n`;
  const url = URL.createObjectURL(new Blob([xml], { type: "application/gpx+xml" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${t.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "terrain"}.gpx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/** Worker gardé entre deux recherches : les tuiles déjà lues restent en mémoire. */
let worker: Worker | null = null, seq = 0;
const pending = new Map<number, { resolve: (r: Terrain[]) => void; reject: (e: Error) => void; progress?: (s: string) => void }>();
function getWorker(): Worker | null {
  if (worker) return worker;
  try { worker = new Worker(new URL("./terrain.worker.ts", import.meta.url), { type: "module" }); } catch { return null; }
  worker.onmessage = (e: MessageEvent<{ id: number; ok?: boolean; results?: Terrain[]; error?: string; progress?: string }>) => {
    const p = pending.get(e.data.id); if (!p) return;
    if (e.data.progress) { p.progress?.(e.data.progress); return; }
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.results!); else p.reject(new Error(e.data.error));
  };
  worker.onerror = (e) => { e.preventDefault(); worker?.terminate(); worker = null; for (const p of pending.values()) p.reject(new Error("WORKER")); pending.clear(); };
  return worker;
}

/** Lance la recherche dans le worker (repli sur le fil principal si le navigateur ne le permet pas). */
async function runSearch(p: SearchInput, progress?: (s: string) => void): Promise<Terrain[]> {
  if (!navigator.onLine) throw new Error("Pas de connexion : la recherche de terrains a besoin du réseau.");
  const inPage = async () => (await import("@/lib/terrain/engine")).searchTerrains(p, progress);
  const w = getWorker();
  if (!w) return inPage();
  const id = ++seq;
  try {
    return await new Promise<Terrain[]>((resolve, reject) => {
      const t = setTimeout(() => { pending.delete(id); reject(new Error("La recherche prend trop de temps. Réessaie, ou réduis la distance ou le rayon.")); }, 90000);
      pending.set(id, { resolve: (r) => { clearTimeout(t); resolve(r); }, reject: (e) => { clearTimeout(t); reject(e); }, progress });
      w.postMessage({ id, input: p });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "WORKER") return inPage();
    throw e;
  }
}
/** Point situé à la fraction `f` de la longueur du tracé (pour le survol du profil). */
function pointAt(t: Terrain, f: number): [number, number] | null {
  if (!t.poly) return null;
  const pts = decodePolyline(t.poly);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  const target = f * cum[cum.length - 1];
  const i = Math.max(1, cum.findIndex((c) => c >= target));
  const a = pts[i - 1], b = pts[i] ?? a, seg = cum[i] - cum[i - 1] || 1, k = (target - cum[i - 1]) / seg;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}
/** Avancement affiché pendant la recherche, d’après l’étape annoncée par le worker. */
function progressOf(step: string | null) {
  const m = step && /(\d+)\/(\d+)/.exec(step);
  if (m) return 8 + (Number(m[1]) / Number(m[2])) * 62;
  if (step?.startsWith("Lecture du relief")) return 78;
  if (step?.startsWith("Calcul")) return 88;
  return 4;
}
const directions = (t: { lat: number; lon: number }) => `https://www.google.com/maps/dir/?api=1&destination=${t.lat.toFixed(6)},${t.lon.toFixed(6)}`;
const keyOf = (t: Terrain) => `${t.kind}:${t.lat.toFixed(4)}:${t.lon.toFixed(4)}:${t.name}`;

/** Petit profil d’altitude ; le survol (ou le doigt) déplace un point sur la carte. */
function Spark({ profile, onHover }: { profile: [number, number][]; onHover?: (f: number | null) => void }) {
  const xs = profile.map((p) => p[0]), zs = profile.map((p) => p[1]);
  const x0 = xs[0], x1 = xs[xs.length - 1] || 1, z0 = Math.min(...zs), z1 = Math.max(...zs), h = Math.max(15, z1 - z0);
  const d = profile.map(([x, z], i) => `${i ? "L" : "M"}${(((x - x0) / (x1 - x0 || 1)) * 118 + 1).toFixed(1)},${(31 - ((z - z0) / h) * 28).toFixed(1)}`).join("");
  return (
    <svg className="terr-spark" viewBox="0 0 120 32" aria-hidden="true" preserveAspectRatio="none"
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); onHover?.(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); }} onPointerLeave={() => onHover?.(null)}>
      <path d={`${d}L119,32L1,32Z`} className="a" /><path d={d} className="l" />
    </svg>
  );
}

function Facts({ t }: { t: Terrain }) {
  const f: string[] = [];
  if (t.distanceKm != null && t.poly) f.push(t.distanceKm < 1 ? `${Math.round(t.distanceKm * 1000)} m` : `${fmtKm(t.distanceKm)} km`);
  if (t.gainM != null) f.push(`${fmtNum(t.gainM)} m D+`);
  if (t.lossM != null && t.kind === "descent") f.push(`${fmtNum(t.lossM)} m D−`);
  if (t.grade != null && t.kind !== "stairs") f.push(`${String(Math.abs(t.grade)).replace(".", ",")} %`);
  if (t.fromStartKm > 0.05) f.push(`à ${fmtKm(t.fromStartKm)} km`);
  return <div className="terr-facts">{f.map((x) => <span key={x} className="chip">{x}</span>)}{t.tags.map((x) => <span key={x} className="chip dim">{x}</span>)}</div>;
}

function Card({ domId, t, on, onSelect, saved, onSave, onDelete, onEdit, onHover }: {
  domId: string; t: Terrain | Saved; onHover?: (f: number | null) => void; on: boolean; onSelect: () => void; saved?: boolean; onSave?: () => void; onDelete?: () => void; onEdit?: (name: string, note: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const s = t as Saved;
  const [name, setName] = useState(t.name), [note, setNote] = useState(s.note ?? "");
  return (
    <li id={domId} className={`item terr ${on ? "on" : ""}`}>
      <button className="terr-main" onClick={onSelect} aria-pressed={on}>
        <span className="terr-kind">{t.source === "mine" ? "Ta sortie" : KIND_LABEL[t.kind]}</span>
        <span className="t">{t.name}</span>
        {t.detail && <span className="s">{t.detail}</span>}
        {s.note && <span className="s terr-note">« {s.note} »</span>}
        <Facts t={t} />
        {t.profile && t.profile.length > 2 && <Spark profile={t.profile} onHover={onHover} />}
      </button>
      {editing && onEdit ? (
        <form className="form terr-edit" onSubmit={async (e) => { e.preventDefault(); await onEdit(name, note); setEditing(false); }}>
          <label className="field">Nom<input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required /></label>
          <label className="field">Note<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ex. : parking au départ, boueux après la pluie" /></label>
          <div className="row"><button className="btn sm" type="submit">Enregistrer</button><button type="button" className="btn ghost sm" onClick={() => setEditing(false)}>Annuler</button></div>
        </form>
      ) : (
        <div className="terr-actions">
          {onSave && <button className={`btn sm ${saved ? "ghost" : ""}`} onClick={onSave} disabled={saved}>{saved ? "Enregistré" : "Enregistrer"}</button>}
          <button className="btn ghost sm" onClick={() => gpx(t)}>GPX</button>
          <a className="btn ghost sm" href={directions(t)} target="_blank" rel="noreferrer">S’y rendre</a>
          {t.osm && <a className="link small" href={t.osm} target="_blank" rel="noreferrer">Fiche OSM</a>}
          {onEdit && <button className="link small" onClick={() => setEditing(true)}>Modifier</button>}
          {onDelete && <button className="iconbtn" aria-label={`Supprimer ${t.name}`} onClick={onDelete}><IconTrash /></button>}
        </div>
      )}
    </li>
  );
}

export default function Terrains({ me, toast }: Ctx) {
  const [view, setView] = useState<"search" | "saved">("search");
  const [q, setQ] = useState<Query>(DEFAULT_Q);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [start, setStart] = useState<Start | null>(null);
  const [place, setPlace] = useState("");
  const [places, setPlaces] = useState<Start[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [results, setResults] = useState<Terrain[] | null>(null);
  const [searched, setSearched] = useState<Query | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [mine, setMine] = useState<Terrain[]>([]);
  const [sel, setSel] = useState(0);
  const [fitKey, setFitKey] = useState("init");
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { const r = await api<{ saved: Saved[]; mine: Terrain[] }>("/api/terrains"); setSaved(r.saved); setMine(r.mine); } catch { /* hors ligne sans copie */ }
  }, []);

  useEffect(() => {
    load();
    const s = read<Start>(START_KEY);
    if (s) { setStart(s); setFitKey(`start-${s.lat}`); }
    const p = read<Preset>(PRESET_KEY, "session");
    if (p) {
      try { sessionStorage.removeItem(PRESET_KEY); } catch { /* rien */ }
      setPreset(p); setQ((x) => ({ ...x, ...fromPreset(p, me.targets) }));
    }
  }, [load, me.targets]);

  const pickStart = useCallback((s: Start, refit = true) => { setStart(s); write(START_KEY, s); setPlaces(null); if (refit) setFitKey(`start-${s.lat}-${s.lon}`); }, []);

  function locate() {
    if (!("geolocation" in navigator)) { setErr("Ton navigateur ne donne pas accès à la position. Cherche un lieu ou touche la carte."); return; }
    setLocating(true); setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); pickStart({ name: "Ma position", lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      (e) => { setLocating(false); setErr(e.code === 1 ? "Accès à la position refusé : autorise-le dans les réglages du navigateur, ou cherche un lieu." : "Position introuvable pour le moment. Cherche un lieu ou touche la carte."); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }
  async function findPlace(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try { const r = await api<{ places: Start[] }>("/api/terrains/places", { method: "POST", body: { query: place } }); setPlaces(r.places); if (!r.places.length) setErr("Aucun lieu trouvé avec ce nom."); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Erreur"); }
  }

  const gainTarget = (x: Query) => {
    const km = Number(x.distanceKm.replace(",", ".")) || 0;
    return x.relief === "precis" ? (x.gainM === "" ? null : Number(x.gainM)) : Math.round(km * RELIEF[x.relief].perKm);
  };

  async function search() {
    if (!start) { setErr("Choisis d’abord un point de départ : ta position, un lieu, ou touche la carte."); return; }
    setBusy(true); setErr(null); setResults(null); setStep("Préparation…");
    const sl = q.kind === "climb" || q.kind === "descent" ? SLOPE[q.kind][q.slope] : null;
    const bodyQ: Record<string, unknown> = { kind: q.kind, lat: start.lat, lon: start.lon, radiusKm: q.radiusKm };
    if (q.kind === "loop") {
      const km = Number(q.distanceKm.replace(",", "."));
      if (!(km >= 2 && km <= 60)) { setBusy(false); setErr("Choisis une distance entre 2 et 60 km."); return; }
      const g = gainTarget(q);
      if (g != null && !(g >= 0 && g <= 4000)) { setBusy(false); setErr("Choisis un D+ entre 0 et 4 000 m."); return; }
      Object.assign(bodyQ, { distanceKm: Math.round(km * 2) / 2, gainM: g, surface: q.surface });
    }
    if (sl) Object.assign(bodyQ, { minLen: LEN[q.len].min, maxLen: LEN[q.len].max, minGrade: sl.min, maxGrade: sl.max });
    try {
      const found = await runSearch(bodyQ as unknown as SearchInput, setStep);
      setResults(found); setSearched(q); setSel(0); setFocusId(null); setFitKey(`res-${Date.now()}`);
      if (!found.length) setErr("Rien trouvé dans ce rayon. Agrandis la zone ou change de point de départ.");
    } catch (e) { setErr(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(false); setStep(null); }
  }

  // Tes propres boucles proches du départ et de la bonne distance, proposées en premier.
  const mineMatches = useMemo(() => {
    if (!start || !searched || searched.kind !== "loop") return [];
    const km = Number(searched.distanceKm.replace(",", "."));
    return mine.filter((m) => m.distanceKm && Math.abs(m.distanceKm - km) / km <= 0.25 && dist(start.lat, start.lon, m.lat, m.lon) <= 8000)
      .map((m) => ({ ...m, fromStartKm: Math.round(dist(start.lat, start.lon, m.lat, m.lon) / 100) / 10 })).slice(0, 3);
  }, [mine, start, searched]);

  const shown: (Terrain | Saved)[] = useMemo(() => (view === "search" ? [...mineMatches, ...(results ?? [])] : [...saved, ...mine.filter((m) => !saved.some((s) => s.id === m.id))]), [view, mineMatches, results, saved, mine]);
  const savedKeys = useMemo(() => new Set(saved.map(keyOf)), [saved]);

  const onMap = (i: number) => view === "search" || i === sel;
  const lines: MapLine[] = useMemo(() => shown.flatMap((t, i) => (t.poly && onMap(i) ? [{ poly: t.poly, id: i, highlight: i === sel, label: t.name }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, sel, view]);
  const markers: MapMarker[] = useMemo(() => [
    ...(start && view === "search" ? [{ at: [start.lat, start.lon] as [number, number], label: `Départ : ${start.name}`, kind: "start" as const }] : []),
    ...shown.flatMap((t, i) => ((!t.poly || t.kind === "stairs") && onMap(i) ? [{ at: [t.lat, t.lon] as [number, number], label: t.name, kind: "aid" as const, id: i }] : [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [shown, start, view, sel]);

  async function save(t: Terrain) {
    try { await api("/api/terrains", { method: "POST", body: t }); await load(); toast("Terrain enregistré dans « Mes terrains »."); }
    catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  async function remove(t: Saved) {
    if (!confirm(`Supprimer « ${t.name} » de tes terrains ?`)) return;
    try { await api(`/api/terrains?id=${t.savedId}`, { method: "DELETE" }); await load(); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  async function edit(t: Saved, name: string, note: string) {
    try { await api("/api/terrains", { method: "PUT", body: { id: t.savedId, name, note } }); await load(); } catch (e) { toast(e instanceof Error ? e.message : "Erreur"); }
  }
  const select = (i: number) => { setSel(i); const el = document.getElementById(`terr-${i}`); el?.scrollIntoView({ behavior: "smooth", block: "nearest" }); };
  const set = (patch: Partial<Query>) => setQ((x) => ({ ...x, ...patch }));
  const pickOnMap = useCallback((lat: number, lon: number) => { if (view === "search") pickStart({ name: "Point choisi sur la carte", lat, lon }, false); }, [view, pickStart]);

  return (
    <>
      <header className="head">
        <div><span className="eyebrow">Où courir ?</span><h1>Terrains</h1></div>
        <div className="seg" role="group" aria-label="Vue">
          <button className={view === "search" ? "on" : ""} onClick={() => { setView("search"); setSel(0); setFitKey(`v-${Date.now()}`); }}>Chercher</button>
          <button className={view === "saved" ? "on" : ""} onClick={() => { setView("saved"); setSel(0); setFitKey(`v-${Date.now()}`); }}>Mes terrains{saved.length ? ` (${saved.length})` : ""}</button>
        </div>
      </header>

      {view === "search" && (
        <section className="card terr-form" aria-label="Recherche de terrains">
                    {preset && (
            <div className="banner terr-preset">
              <div><b>Pour ta séance : {preset.title}</b><div className="small muted">{dayLabel(preset.date)} · {fmtDur(preset.durationMin)}{preset.gainM ? ` · ${fmtNum(preset.gainM)} m D+` : ""}</div></div>
              <button className="link small" onClick={() => { setPreset(null); setQ(DEFAULT_Q); }}>Recherche libre</button>
            </div>
          )}

          <div className="terr-start">
            <span className="terr-label">Départ</span>
            <div className="row">
              <button className="btn ghost sm" onClick={locate} disabled={locating}><IconPin />{locating ? "Localisation…" : "Ma position"}</button>
              <form className="terr-place" onSubmit={findPlace} role="search">
                <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ville, village, lieu…" aria-label="Chercher un lieu de départ" maxLength={80} />
                <button className="btn ghost sm" type="submit" disabled={place.trim().length < 2}>Chercher</button>
              </form>
            </div>
            {places && places.length > 0 && <ul className="wx-places">{places.map((p) => <li key={`${p.lat},${p.lon}`}><button onClick={() => pickStart(p)}>{p.name}</button></li>)}</ul>}
            <p className="soft small" style={{ margin: 0 }}>{start ? <>Départ : <b>{start.name}</b> · tu peux aussi toucher la carte pour le déplacer.</> : "Ou touche la carte à l’endroit d’où tu veux partir."}</p>
          </div>

          <div className="terr-kinds" role="radiogroup" aria-label="Je cherche">
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <button key={k} role="radio" aria-checked={q.kind === k} className={q.kind === k ? "on" : ""} onClick={() => set({ kind: k })}>{KIND_LABEL[k]}</button>
            ))}
          </div>
          <p className="soft small" style={{ margin: 0 }}>{KIND_HINT[q.kind]}</p>

          {q.kind === "loop" && (
            <div className="form terr-params">
              <label className="field">Distance (km)<input inputMode="decimal" value={q.distanceKm} onChange={(e) => set({ distanceKm: e.target.value })} /></label>
              <fieldset className="scale">
                <legend>Relief</legend>
                <div className="picks terr-p4">
                  {(["plat", "vallonne", "montagne", "precis"] as Relief[]).map((r) => (
                    <label key={r} className={q.relief === r ? "on" : ""}><input type="radio" name="relief" checked={q.relief === r} onChange={() => set({ relief: r })} />{r === "precis" ? "D+ précis" : RELIEF[r].label}</label>
                  ))}
                </div>
              </fieldset>
              {q.relief === "precis" ? <label className="field">D+ visé (m)<input inputMode="numeric" value={q.gainM} onChange={(e) => set({ gainM: e.target.value })} placeholder="600" /></label>
                : <p className="soft small" style={{ margin: 0 }}>Environ {fmtNum(gainTarget(q) ?? 0)} m de D+ visés.</p>}
              <fieldset className="scale">
                <legend>Terrain</legend>
                <div className="picks p3">
                  {([["trail", "Sentiers"], ["mixed", "Mixte"], ["any", "Peu importe"]] as [Surface, string][]).map(([v, l]) => (
                    <label key={v} className={q.surface === v ? "on" : ""}><input type="radio" name="surface" checked={q.surface === v} onChange={() => set({ surface: v })} />{l}</label>
                  ))}
                </div>
              </fieldset>
            </div>
          )}
          {(q.kind === "climb" || q.kind === "descent") && (
            <div className="form terr-params">
              <fieldset className="scale">
                <legend>Longueur</legend>
                <div className="picks p3">
                  {(Object.keys(LEN) as Len[]).map((l) => <label key={l} className={q.len === l ? "on" : ""}><input type="radio" name="len" checked={q.len === l} onChange={() => set({ len: l })} /><span>{LEN[l].label}<small>{LEN[l].sub}</small></span></label>)}
                </div>
              </fieldset>
              <fieldset className="scale">
                <legend>Pente</legend>
                <div className="picks p3">
                  {(Object.keys(SLOPE[q.kind]) as Slope[]).map((s) => { const v = SLOPE[q.kind as "climb"][s]; return <label key={s} className={q.slope === s ? "on" : ""}><input type="radio" name="slope" checked={q.slope === s} onChange={() => set({ slope: s })} /><span>{v.label}<small>{v.min}–{v.max} %</small></span></label>; })}
                </div>
              </fieldset>
            </div>
          )}
          {q.kind !== "loop" && (
            <label className="field terr-radius">Rayon de recherche : {String(q.radiusKm).replace(".", ",")} km
              <input type="range" min={1} max={q.kind === "climb" || q.kind === "descent" ? 5 : 10} step={0.5} value={q.radiusKm} onChange={(e) => set({ radiusKm: Number(e.target.value) })} />
            </label>
          )}

          {err && <p className="note err" role="alert" style={{ margin: 0 }}>{err}</p>}
          <div className="row">
            <button className="btn" onClick={search} disabled={busy}>{busy ? "Recherche en cours…" : "Chercher"}</button>
            {busy && <span className="soft small terr-wait" role="status">{step ?? "Recherche…"}</span>}
          </div>
          {busy && <div className="terr-progress" aria-hidden="true"><i style={{ width: `${progressOf(step)}%` }} /></div>}
        </section>
      )}

      <section className="card" style={{ marginTop: 14 }} aria-label="Carte">
        <TrackMap lines={lines} markers={markers} height={360} onSelect={select} onPick={pickOnMap} fitKey={fitKey} focus={focusId} hover={hover} label="Carte des terrains" />
      </section>

      {view === "search" && busy && (
        <section className="card" style={{ marginTop: 14 }} aria-hidden="true">
          {[0, 1, 2].map((k) => <div key={k} className="skel-row"><i className="sk sk-t" /><i className="sk sk-s" /><i className="sk sk-c" /></div>)}
        </section>
      )}
      {view === "search" && (mineMatches.length > 0 || (results && results.length > 0)) && (
        <section className="card" style={{ marginTop: 14 }}>
          <div className="card-head"><h2>{results?.length ?? 0} terrain{(results?.length ?? 0) > 1 ? "s" : ""} trouvé{(results?.length ?? 0) > 1 ? "s" : ""}{mineMatches.length ? ` · ${mineMatches.length} de tes boucles` : ""}</h2></div>
          <ul className="list terr-list">
            {shown.map((t, i) => (
              <Card key={t.id + i} domId={`terr-${i}`} t={t} on={i === sel} onSelect={() => { setSel(i); setFocusId(i); }} saved={savedKeys.has(keyOf(t))} onSave={() => save(t)} onHover={(f) => setHover(f == null ? null : pointAt(t, f))} />
            ))}
          </ul>
          <p className="muted terr-legal">Tracés calculés automatiquement à partir d’OpenStreetMap : vérifie l’accès, l’état des chemins et les conditions avant de partir. D+ estimé à partir d’un modèle de terrain. Données © contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>, tuiles <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © OpenMapTiles ; altitude : <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Mapzen Terrain Tiles</a> (SRTM, EU-DEM, Copernicus et autres sources ouvertes).</p>
        </section>
      )}

      {view === "saved" && (
        <section className="card" style={{ marginTop: 14 }}>
          {shown.length === 0 ? (
            <p className="empty">Aucun terrain pour l’instant. Lance une recherche et touche « Enregistrer » sur un terrain qui te plaît. Tes boucles apparaîtront aussi ici dès que tu auras importé des sorties avec un tracé GPS.</p>
          ) : (
            <>
              {saved.length > 0 && <div className="card-head"><h2>Enregistrés</h2></div>}
              <ul className="list terr-list">
                {shown.map((t, i) => {
                  const isSaved = "savedId" in t;
                  const head = !isSaved && (i === 0 || "savedId" in shown[i - 1]);
                  return (
                    <Fragment key={t.id + i}>
                      {head && <li className="terr-sub"><h2>Tes boucles</h2></li>}
                      <Card domId={`terr-${i}`} t={t} on={i === sel} onSelect={() => { setSel(i); setFitKey(`sel-${i}-${Date.now()}`); }}
                        saved={isSaved || savedKeys.has(keyOf(t))}
                        onSave={isSaved ? undefined : () => save(t)}
                        onDelete={isSaved ? () => remove(t as Saved) : undefined}
                        onEdit={isSaved ? (n, no) => edit(t as Saved, n, no) : undefined} />
                    </Fragment>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
