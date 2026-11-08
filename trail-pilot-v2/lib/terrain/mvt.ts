/**
 * Décodeur minimal de tuiles vectorielles (format Mapbox Vector Tile, protobuf) :
 * seulement ce qu’il faut pour lire les calques de chemins et de lieux.
 */
export interface MvtFeature { type: number; tags: Record<string, string | number | boolean>; lines: [number, number][][] }
export interface MvtLayer { name: string; extent: number; features: MvtFeature[] }

class Reader {
  pos = 0;
  constructor(public buf: Uint8Array) {}
  varint(): number {
    let v = 0, s = 0, b: number;
    do { b = this.buf[this.pos++]; v += (b & 0x7f) * 2 ** s; s += 7; } while (b >= 0x80);
    return v;
  }
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.pos += this.varint();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`Type protobuf inconnu ${wire}`);
  }
  bytes(): Uint8Array { const n = this.varint(), out = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return out; }
  string(): string { return new TextDecoder().decode(this.bytes()); }
  packed(): number[] { const end = this.varint() + this.pos, out: number[] = []; while (this.pos < end) out.push(this.varint()); return out; }
}

const zz = (n: number) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

function value(r: Reader): string | number | boolean {
  const end = r.varint() + r.pos;
  let v: string | number | boolean = "";
  while (r.pos < end) {
    const k = r.varint(), f = k >> 3, w = k & 7;
    if (f === 1) v = r.string();
    else if (f === 2) { v = new DataView(r.buf.buffer, r.buf.byteOffset + r.pos, 4).getFloat32(0, true); r.pos += 4; }
    else if (f === 3) { v = new DataView(r.buf.buffer, r.buf.byteOffset + r.pos, 8).getFloat64(0, true); r.pos += 8; }
    else if (f === 4 || f === 5) v = r.varint();
    else if (f === 6) v = zz(r.varint());
    else if (f === 7) v = r.varint() === 1;
    else r.skip(w);
  }
  return v;
}

function geometry(cmds: number[]): [number, number][][] {
  const lines: [number, number][][] = [];
  let x = 0, y = 0, i = 0, cur: [number, number][] | null = null;
  while (i < cmds.length) {
    const c = cmds[i++], id = c & 7, count = c >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < count; k++) {
        x += zz(cmds[i++]); y += zz(cmds[i++]);
        if (id === 1) { cur = [[x, y]]; lines.push(cur); } else cur?.push([x, y]);
      }
    } else if (id === 7 && cur?.length) cur.push([cur[0][0], cur[0][1]]);
  }
  return lines;
}

/** Lit les calques demandés d’une tuile. */
export function decodeTile(buf: Uint8Array, wanted: Set<string>): MvtLayer[] {
  const r = new Reader(buf), layers: MvtLayer[] = [];
  while (r.pos < buf.length) {
    const k = r.varint();
    if (k >> 3 !== 3 || (k & 7) !== 2) { r.skip(k & 7); continue; }
    const end = r.varint() + r.pos;
    const start = r.pos;
    // Premier passage : nom du calque, pour sauter vite ceux qui ne servent pas.
    let name = "";
    while (r.pos < end) { const kk = r.varint(); if (kk >> 3 === 1) { name = r.string(); break; } r.skip(kk & 7); }
    if (!wanted.has(name)) { r.pos = end; continue; }
    r.pos = start;
    const keys: string[] = [], vals: (string | number | boolean)[] = [], raw: { tags: number[]; type: number; geom: number[] }[] = [];
    let extent = 4096;
    while (r.pos < end) {
      const kk = r.varint(), f = kk >> 3, w = kk & 7;
      if (f === 1) r.string();
      else if (f === 2) {
        const fe = r.varint() + r.pos, ft = { tags: [] as number[], type: 0, geom: [] as number[] };
        while (r.pos < fe) {
          const fk = r.varint(), ff = fk >> 3;
          if (ff === 2) ft.tags = r.packed();
          else if (ff === 3) ft.type = r.varint();
          else if (ff === 4) ft.geom = r.packed();
          else r.skip(fk & 7);
        }
        raw.push(ft);
      } else if (f === 3) keys.push(r.string());
      else if (f === 4) vals.push(value(r));
      else if (f === 5) extent = r.varint();
      else r.skip(w);
    }
    layers.push({
      name, extent,
      features: raw.map((ft) => {
        const tags: MvtFeature["tags"] = {};
        for (let t = 0; t + 1 < ft.tags.length; t += 2) tags[keys[ft.tags[t]]] = vals[ft.tags[t + 1]];
        return { type: ft.type, tags, lines: geometry(ft.geom) };
      }),
    });
  }
  return layers;
}
