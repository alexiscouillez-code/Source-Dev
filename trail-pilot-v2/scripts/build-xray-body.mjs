// Construit le corps 3D de l’X-Ray à partir de l’atlas anatomique BodyParts3D 4.0
// (© The Database Center for Life Science, CC BY 4.0), tel que préparé par le projet Human Atlas.
//
// - récupère l’atlas à une version figée (ou depuis un dossier local : XRAY_SRC=/chemin/vers/public/models) ;
// - garde la peau, les os et les muscles squelettiques, regroupés en zones d’effort ;
// - simplifie chaque structure (meshoptimizer), quantifie positions et normales ;
// - écrit public/xray/body.bin et public/xray/body.json.
//
// Adaptations : sélection de structures, simplification, regroupement par zones, quantification.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { MeshoptSimplifier } from "meshoptimizer";

const COMMIT = "5bb5713aab18d7fe9380c3339eb09f173491ea06";
const REMOTE = `https://raw.githubusercontent.com/slorksmo/human-atlas/${COMMIT}/public/models`;
const OUT = new URL("../public/xray/", import.meta.url);
const VERSION = 5;

const ZONES = [
  ["glutes", /gluteus|piriformis|gemellus|obturator|quadratus femoris/i],
  ["quads", /rectus femoris|vastus/i],
  ["hamstrings", /biceps femoris|semitendinosus|semimembranosus/i],
  ["adductors", /adductor (longus|brevis|magnus|minimus)|gracilis|pectineus/i],
  ["hipflex", /psoas|iliacus|sartorius|tensor fasci/i],
  ["knees", /popliteus|patella|menisc|cruciate|knee/i],
  ["calves", /gastrocnemius|soleus|plantaris/i],
  ["shins", /tibialis anterior|extensor digitorum longus|extensor hallucis longus|fibularis tertius|peroneus tertius/i],
  ["ankles", /fibularis (longus|brevis)|peroneus (longus|brevis)|tibialis posterior|flexor digitorum longus|flexor hallucis longus/i],
  ["feet", /of (left|right) foot|abductor hallucis|flexor digitorum brevis|flexor accessorius|quadratus plantae|extensor (digitorum|hallucis) brevis|adductor hallucis|flexor hallucis brevis/i],
  ["lumbar", /iliocostalis|longissimus thoracis|spinalis|multifid|quadratus lumborum|semispinalis thoracis/i],
  ["core", /rectus abdominis|external oblique|internal oblique|transversus abdominis|pyramidalis/i],
];
// Muscles internes, de la tête et des organes : sans intérêt ici et invisibles sous les autres.
const SKIP_MUSCLE = /papillary|ventric|crico|aryt|vocalis|thyro|glossus|palat|uvul|levator palpebrae|(superior|inferior|medial|lateral) rectus$|(superior|inferior) oblique$|sphincter|perineal|coccyg|pubococc|puborect|iliococc|diaphragm|intercostal|transversus thoracis|rotator|intertransvers|interspinal|levatores|longus colli|capitis|digastric|hyoid|platysma|cricothyroid|stapedius|tensor tympani|ciliary/i;
const SKIP_HAND = /of (left|right) hand|pollicis|interossei of (left|right) hand|lumbricals of (left|right) hand|aryepiglott/i;
const SKIP_BONE = /tooth|teeth|incisor|canine|premolar|molar|gingiva|ossicle|malleus|incus|stapes|hyoid|cartilage/i;

const zoneOf = (name) => ZONES.find(([, re]) => re.test(name))?.[0] ?? null;

async function source(name) {
  if (process.env.XRAY_SRC) return readFile(`${process.env.XRAY_SRC}/${name}`);
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${REMOTE}/${name}`).catch((e) => ({ ok: false, status: e.message }));
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    if (attempt >= 3) throw new Error(`Téléchargement impossible : ${name} (${res.status})`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
}

async function main() {
  try {
    const m = JSON.parse(await readFile(new URL("body.json", OUT), "utf8"));
    if (m.version === VERSION && (await stat(new URL("body.bin", OUT))).size === m.bytes) { console.log("xray: corps déjà construit"); return; }
  } catch { /* à construire */ }

  await MeshoptSimplifier.ready;
  const atlas = JSON.parse((await source("atlas.json")).toString("utf8"));
  const pick = [];
  for (const p of atlas.parts) {
    let group = null, zone = null, ratio = 0;
    if (p.system === "integumentary" && p.name === "Skin") { group = "skin"; ratio = 0.45; }
    else if (p.system === "skeletal" && !SKIP_BONE.test(p.name)) { group = "bone"; ratio = 0.1; zone = /patella/i.test(p.name) ? "knees" : null; }
    else if (p.system === "muscular" && !SKIP_MUSCLE.test(p.name) && !SKIP_HAND.test(p.name)) { group = "muscle"; zone = zoneOf(p.name); ratio = zone ? 0.35 : 0.2; }
    else if (p.system === "connective" && /menisc|cruciate|collateral ligament.*knee|patellar ligament/i.test(p.name)) { group = "muscle"; ratio = 0.4; zone = "knees"; }
    if (group) pick.push({ p, group, zone, ratio });
  }
  const chunks = [...new Set(pick.map((x) => x.p.chunk))].sort((a, b) => a - b);
  const buffers = new Map();
  for (const c of chunks) {
    const info = atlas.chunks[c];
    buffers.set(c, gunzipSync(await source(info.gzip.split("/").pop())));
  }

  // Bornes globales pour la quantification
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const { p } of pick) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p.bounds[0][k]); max[k] = Math.max(max[k], p.bounds[1][k]); }
  const scale = max.map((v, k) => (v - min[k]) / 65534);

  const pos = [], nor = [], idx = [], parts = [];
  let vBase = 0, iBase = 0, tris = 0;
  for (const { p, group, zone, ratio } of pick) {
    const b = buffers.get(p.chunk);
    const P = new Float32Array(b.buffer, b.byteOffset + p.positions, p.vertexCount * 3);
    const N = new Int16Array(b.buffer, b.byteOffset + p.normals, p.vertexCount * 3);
    const I = new Uint32Array(b.buffer, b.byteOffset + p.indices, p.indexCount);
    const target = Math.max(36, Math.floor((p.indexCount * ratio) / 3) * 3);
    const err = group === "skin" ? 0.004 : group === "bone" ? 0.05 : zone ? 0.02 : 0.04;
    const [simple] = MeshoptSimplifier.simplify(I, P, 3, target, err, ["LockBorder"]);
    // Compactage : on ne garde que les sommets utilisés, indices locaux sur 16 bits.
    const remap = new Map(), local = new Uint16Array(simple.length);
    let ok = true;
    for (let i = 0; i < simple.length; i++) {
      const v = simple[i];
      let r = remap.get(v);
      if (r === undefined) { r = remap.size; if (r > 65535) { ok = false; break; } remap.set(v, r); for (let k = 0; k < 3; k++) { pos.push(Math.round((P[v * 3 + k] - min[k]) / scale[k]) - 32767); nor.push(Math.round(N[v * 3 + k] / 258)); } }
      local[i] = r;
    }
    if (!ok) throw new Error(`Trop de sommets : ${p.name}`);
    for (const v of local) idx.push(v);
    const side = /\bleft\b/i.test(p.name) ? "L" : /\bright\b/i.test(p.name) ? "R" : "C";
    parts.push({ n: p.name, g: group, z: zone, s: side, v: vBase, vc: remap.size, i: iBase, ic: local.length });
    vBase += remap.size; iBase += local.length; tris += local.length / 3;
  }

  const posBuf = Buffer.from(new Int16Array(pos).buffer);
  const norBuf = Buffer.from(new Int8Array(nor).buffer);
  const pad = (n) => (4 - (n % 4)) % 4;
  const norOffset = posBuf.length, norPad = pad(norOffset + norBuf.length);
  const idxOffset = norOffset + norBuf.length + norPad;
  const idxBuf = Buffer.from(new Uint16Array(idx).buffer);
  const bin = Buffer.concat([posBuf, norBuf, Buffer.alloc(norPad), idxBuf]);

  await mkdir(OUT, { recursive: true });
  await writeFile(new URL("body.bin", OUT), bin);
  const manifest = {
    version: VERSION, bytes: bin.length, vertices: vBase, triangles: tris, min, scale, offsets: { positions: 0, normals: norOffset, indices: idxOffset },
    credit: "BodyParts3D © The Database Center for Life Science, CC BY 4.0 — adapté par Trail Pilot (sélection, simplification, regroupement par zones) à partir de la préparation du projet Human Atlas.",
    parts,
  };
  await writeFile(new URL("body.json", OUT), JSON.stringify(manifest));
  const zoned = parts.filter((x) => x.z).length;
  console.log(`xray: ${parts.length} structures (${zoned} dans une zone), ${Math.round(tris / 1000)} k triangles, ${(bin.length / 1048576).toFixed(1)} Mo`);
}

main().catch((e) => { console.error("xray:", e.message); process.exit(1); });
