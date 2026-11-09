"use client";

/**
 * Export d’une séance du planning en fichier de séance structurée FIT (format Garmin), avec
 * échauffement, corps de séance, retour au calme et cibles cardio de la personne.
 * Sur une montre Garmin : copier le fichier dans le dossier GARMIN/NewFiles (câble USB).
 */
import type { PlanSession, Targets } from "./client";

// ---------- Écriture FIT ----------
const CRC = [0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800, 0xb401, 0x5000, 0x9c01, 0x8801, 0x4400];
function crc16(bytes: number[], from = 0, to = bytes.length) {
  let c = 0;
  for (let i = from; i < to; i++) {
    const b = bytes[i];
    let t = CRC[c & 0xf]; c = (c >> 4) & 0x0fff; c = c ^ t ^ CRC[b & 0xf];
    t = CRC[c & 0xf]; c = (c >> 4) & 0x0fff; c = c ^ t ^ CRC[(b >> 4) & 0xf];
  }
  return c;
}
type Field = [num: number, size: number, base: number];
const ENUM = 0x00, U16 = 0x84, U32 = 0x86, U32Z = 0x8c, STR = 0x07;

class Fit {
  data: number[] = [];
  def(local: number, global: number, fields: Field[]) {
    this.data.push(0x40 | local, 0, 0, global & 0xff, global >> 8, fields.length);
    for (const [n, s, b] of fields) this.data.push(n, s, b);
  }
  msg(local: number, fields: Field[], values: (number | string)[]) {
    this.data.push(local);
    fields.forEach(([, size, base], i) => {
      const v = values[i];
      if (base === STR) {
        const enc = [...new TextEncoder().encode(String(v))].slice(0, size - 1);
        while (enc.length < size) enc.push(0);
        this.data.push(...enc);
      } else {
        let n = Number(v) >>> 0;
        for (let k = 0; k < size; k++) { this.data.push(n & 0xff); n = Math.floor(n / 256); }
      }
    });
  }
  bytes(): Uint8Array {
    const h = [14, 0x20, 2132 & 0xff, 2132 >> 8, ...[0, 8, 16, 24].map((s) => (this.data.length >>> s) & 0xff), 0x2e, 0x46, 0x49, 0x54];
    const hc = crc16(h);
    const all = [...h, hc & 0xff, hc >> 8, ...this.data];
    const c = crc16(all, 14);
    all.push(c & 0xff, c >> 8);
    return Uint8Array.from(all);
  }
}

// ---------- Séance structurée ----------
type Intensity = 0 | 1 | 2 | 3 | 4; // actif, repos, échauffement, retour au calme, récupération
interface Step { name: string; min?: number; open?: boolean; zone?: [number, number]; intensity: Intensity; notes?: string; repeat?: { from: number; times: number } }

function stepsFor(s: Pick<PlanSession, "template" | "duration_min" | "title">): Step[] {
  const d = Math.max(10, s.duration_min);
  const warm = (min = 15): Step => ({ name: "Échauffement", min, zone: [1, 2], intensity: 2 });
  const cool = (min = 10): Step => ({ name: "Retour au calme", min, zone: [1, 2], intensity: 3 });
  const reps = (each: number, lo = 3, hi = 12) => Math.max(lo, Math.min(hi, Math.floor((d - 25) / each)));
  switch (s.template) {
    case "tempo": { const main = Math.max(10, d - 25); return [warm(), { name: "Seuil", min: main, zone: [4, 4], intensity: 0, notes: "Blocs au seuil, effort soutenu mais contrôlé" }, cool()]; }
    case "hills": { const n = reps(2.5); return [warm(), { name: "Côte vive", min: 1, zone: [4, 5], intensity: 0, notes: "Montée à effort vif" }, { name: "Descente trot", min: 1.5, zone: [1, 2], intensity: 4 }, { name: "Répéter", intensity: 0, repeat: { from: 1, times: n } }, cool()]; }
    case "climb": { const n = Math.max(2, Math.min(5, Math.floor((d - 25) / 12))); return [warm(), { name: "Montée longue", min: 8, zone: [3, 4], intensity: 0, notes: "Effort régulier, marche si besoin" }, { name: "Redescente", min: 4, zone: [1, 2], intensity: 4 }, { name: "Répéter", intensity: 0, repeat: { from: 1, times: n } }, cool()]; }
    case "downhill": { const n = reps(7, 2, 8); return [warm(), { name: "Descente", min: 3, zone: [2, 3], intensity: 0, notes: "Pas courts, regard loin, relâché" }, { name: "Remontée facile", min: 4, zone: [1, 2], intensity: 4 }, { name: "Répéter", intensity: 0, repeat: { from: 1, times: n } }, cool()]; }
    case "sharpen": return [{ name: "Endurance", min: 10, zone: [2, 2], intensity: 2 }, { name: "Accélération", min: 1, zone: [3, 4], intensity: 0 }, { name: "Trot", min: 1, zone: [1, 2], intensity: 4 }, { name: "Répéter", intensity: 0, repeat: { from: 1, times: 4 } }, { name: "Retour au calme", min: Math.max(2, d - 18), zone: [1, 2], intensity: 3 }];
    case "test": return [warm(10), { name: "Allure de course", min: Math.max(10, d - 20), zone: [2, 3], intensity: 0, notes: "Teste allure et nutrition" }, cool()];
    case "race": return [{ name: s.title.slice(0, 30), open: true, intensity: 0 }];
    default: return [{ name: s.template === "long" ? "Sortie longue" : "Endurance", min: d, zone: [2, 2], intensity: 0, notes: "En montée, marche dès que la FC dépasse la zone" }];
  }
}

export function workoutFit(s: Pick<PlanSession, "template" | "duration_min" | "title" | "gain_m">, targets?: Targets): Uint8Array {
  const zone = (z: [number, number]) => {
    const lo = targets?.zones.find((x) => x.z === z[0]), hi = targets?.zones.find((x) => x.z === z[1]);
    return lo && hi ? [lo.low, hi.high] : null;
  };
  const steps = stepsFor(s);
  const f = new Fit();
  const FID: Field[] = [[0, 1, ENUM], [1, 2, U16], [2, 2, U16], [3, 4, U32Z], [4, 4, U32]];
  f.def(0, 0, FID);
  f.msg(0, FID, [5, 255, 0, Math.floor(Math.random() * 2 ** 31) + 1, Math.floor(Date.now() / 1000) - 631065600]);
  const WK: Field[] = [[4, 1, ENUM], [11, 1, ENUM], [6, 2, U16], [8, 32, STR]];
  f.def(1, 26, WK);
  f.msg(1, WK, [1, s.gain_m ? 3 : 0, steps.length, s.title]);
  const ST: Field[] = [[254, 2, U16], [0, 24, STR], [1, 1, ENUM], [2, 4, U32], [3, 1, ENUM], [4, 4, U32], [5, 4, U32], [6, 4, U32], [7, 1, ENUM], [8, 64, STR]];
  f.def(2, 27, ST);
  steps.forEach((st, i) => {
    if (st.repeat) { f.msg(2, ST, [i, st.name, 6, st.repeat.from, 2, st.repeat.times, 0, 0, 0, ""]); return; }
    const hr = st.zone ? zone(st.zone) : null;
    f.msg(2, ST, [
      i, st.name, st.open || !st.min ? 5 : 0, st.min ? Math.round(st.min * 60000) : 0,
      hr ? 1 : 2, 0, hr ? hr[0] + 100 : 0, hr ? hr[1] + 100 : 0, st.intensity, st.notes ?? "",
    ]);
  });
  return f.bytes();
}

export function downloadWorkout(s: PlanSession, targets?: Targets) {
  const bytes = workoutFit(s, targets);
  const slug = s.title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.ant.fit" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${s.date}-${slug || "seance"}.fit`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  window.dispatchEvent(new CustomEvent("tp-toast", { detail: "Séance téléchargée (.fit). Sur une Garmin, copie le fichier dans le dossier GARMIN/NewFiles de la montre (câble USB) : elle apparaît dans Entraînement › Séances." }));
}
