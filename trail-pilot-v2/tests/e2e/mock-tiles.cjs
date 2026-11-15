// Faux Overpass + altitude pour les tests locaux.
const http = require('http'); const zlib = require('zlib');
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(z, x, y) {
  const raw = Buffer.alloc(256 * (1 + 256 * 3)); let o = 0;
  for (let py = 0; py < 256; py++) { raw[o++] = 0; for (let px = 0; px < 256; px++) {
    const n = 2 ** z, gx = (x * 256 + px + 0.5) / (n * 256), gy = (y * 256 + py + 0.5) / (n * 256);
    const lo = gx * 360 - 180, la = Math.atan(Math.sinh(Math.PI * (1 - 2 * gy))) * 180 / Math.PI;
    const v = z0(la, lo) + 32768; raw[o++] = Math.floor(v / 256); raw[o++] = Math.floor(v % 256); raw[o++] = Math.floor((v % 1) * 256); } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(256, 0); ih.writeUInt32BE(256, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
let z0;
// ---- Tuiles vectorielles (MVT) générées à partir du réseau simulé ----
const vint = (n) => { const o = []; while (n > 127) { o.push((n & 127) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const zig = (n) => (n << 1) ^ (n >> 31);
const fld = (f, w) => vint((f << 3) | w);
const lenDel = (f, bytes) => [...fld(f, 2), ...vint(bytes.length), ...bytes];
const str = (f, s) => lenDel(f, [...Buffer.from(s, 'utf8')]);
const packed = (f, arr) => lenDel(f, arr.flatMap(vint));
function layer(name, feats) {
  const keys = [], vals = [], kix = (k) => { let i = keys.indexOf(k); if (i < 0) { keys.push(k); i = keys.length - 1; } return i; }, vix = (v) => { let i = vals.indexOf(v); if (i < 0) { vals.push(v); i = vals.length - 1; } return i; };
  const fb = feats.map((f, n) => { const tags = Object.entries(f.tags).flatMap(([k, v]) => [kix(k), vix(String(v))]); return lenDel(2, [...fld(1, 0), ...vint(n + 1), ...packed(2, tags), ...fld(3, 0), ...vint(f.type), ...packed(4, f.geom)]); });
  return lenDel(3, [...fld(15, 0), 2, ...str(1, name), ...fb.flat(), ...keys.flatMap((k) => str(3, k)), ...vals.flatMap((v) => lenDel(4, str(1, v))), ...fld(5, 0), ...vint(4096)]);
}
function geomLine(pts) { const g = []; let cx = 0, cy = 0; pts.forEach(([x, y], i) => { if (i === 0) g.push((1 << 3) | 1); if (i === 1) g.push(((pts.length - 1) << 3) | 2); g.push(zig(x - cx), zig(y - cy)); cx = x; cy = y; }); return g; }
function mvt(z, x, y) {
  const n = 2 ** z, toT = (p) => [Math.round(((p.lon + 180) / 360 * n - x) * 4096), Math.round(((0.5 - Math.log((1 + Math.sin(p.lat * Math.PI / 180)) / (1 - Math.sin(p.lat * Math.PI / 180))) / (4 * Math.PI)) * n - y) * 4096)];
  const inT = ([a, b]) => a > -400 && a < 4496 && b > -400 && b < 4496;
  const tr = [], nm = [], poi = [];
  for (const w of [...ways, ...steps]) {
    let pts = w.geometry.map(toT); if (!pts.some(inT)) continue;
    // Comme Planetiler : sommets alignés supprimés (ici, un sur cinq gardé sur les routes et chemins larges).
    if (process.env.SIMPLIFY && (w.tags.highway === 'residential' || w.tags.highway === 'track')) pts = pts.filter((_, k) => k % 5 === 0 || k === pts.length - 1);
    const hw = w.tags.highway, cls = hw === 'track' ? 'track' : hw === 'residential' ? 'minor' : 'path';
    tr.push({ type: 2, tags: { class: cls, ...(cls === 'path' ? { subclass: hw } : {}), surface: w.tags.surface === 'asphalt' ? 'paved' : 'unpaved' }, geom: geomLine(pts) });
    if (w.tags.name) nm.push({ type: 2, tags: { class: cls, name: w.tags.name }, geom: geomLine(pts) });
  }
  const P = [...water.map((e) => ({ e, cls: e.tags.natural ? 'spring' : 'drinking_water' })), ...fitness.map((e) => ({ e, cls: 'fitness_station' })), { e: { ...track[0].center, tags: track[0].tags }, cls: 'athletics' }];
  for (const { e, cls } of P) { const p = toT(e); if (!inT(p)) continue; poi.push({ type: 1, tags: { class: cls, subclass: cls, ...(e.tags.name ? { name: e.tags.name } : {}) }, geom: [(1 << 3) | 1, zig(p[0]), zig(p[1])] }); }
  return Buffer.from([...layer('transportation', tr), ...layer('transportation_name', nm), ...layer('poi', poi), ...layer('water', [])]);
}
const lat0 = 43.58, lon0 = 6.98, N = 120, step = 40;
const dLat = step / 111320, dLon = step / (111320 * Math.cos(lat0 * Math.PI / 180));
const pos = (i, j) => ({ lat: lat0 + i * dLat + Math.sin(j * 0.7) * dLat * 0.15, lon: lon0 + j * dLon + Math.cos(i * 0.5) * dLon * 0.15 });
const id = (i, j) => i * 1000 + j + 1;
const ways = []; let wid = 1;
for (let i = 0; i < N; i += 2) { const nodes = [], geometry = []; for (let j = 0; j < N; j++) { nodes.push(id(i, j)); geometry.push(pos(i, j)); } ways.push({ type: 'way', id: wid++, nodes, geometry, tags: { highway: i % 6 ? 'path' : 'residential', name: i % 6 ? `Sentier des Pins ${i}` : `Avenue ${i}`, surface: i % 6 ? 'ground' : 'asphalt', ...(i % 10 === 2 ? { sac_scale: 'mountain_hiking' } : {}) } }); }
for (let j = 0; j < N; j += 2) { const nodes = [], geometry = []; for (let i = 0; i < N; i++) { nodes.push(id(i, j)); geometry.push(pos(i, j)); } ways.push({ type: 'way', id: wid++, nodes, geometry, tags: { highway: j % 8 ? 'track' : 'residential', surface: j % 8 ? 'gravel' : 'asphalt' } }); }
const C = pos(60, 60);
const z = z0 = (la, lo) => 40 + 320 * Math.exp(-(((la - (lat0 + 85 * dLat)) / (25 * dLat)) ** 2 + ((lo - (lon0 + 40 * dLon)) / (25 * dLon)) ** 2)) + 120 * Math.exp(-(((la - (lat0 + 30 * dLat)) / (15 * dLat)) ** 2 + ((lo - (lon0 + 90 * dLon)) / (15 * dLon)) ** 2));
const near = (k, dl, dg) => ({ lat: C.lat + dl * dLat, lon: C.lon + dg * dLon });
const steps = [0, 1, 2].map((k) => { const a = near(k, 5 + k * 9, 3 + k * 7), b = { lat: a.lat + 2 * dLat, lon: a.lon }; return { type: 'way', id: 9000 + k, nodes: [1, 2], geometry: [a, b], tags: { highway: 'steps', step_count: String(40 + k * 30), name: k === 0 ? 'Escaliers du Château' : undefined } }; });
const fitness = [0, 1, 2, 3].map((k) => ({ type: 'node', id: 7000 + k, ...near(k, -10 + k, -12), tags: { leisure: 'fitness_station' } }));
const track = [{ type: 'way', id: 8000, center: near(0, 30, -30), tags: { leisure: 'track', sport: 'athletics', name: 'Stade municipal', surface: 'tartan', access: 'yes' } }];
const water = [{ type: 'node', id: 6000, ...near(0, 3, 2), tags: { amenity: 'drinking_water' } }, { type: 'node', id: 6001, ...near(0, -20, 15), tags: { natural: 'spring', drinking_water: 'yes', name: 'Source du Vallon' } }];
http.createServer((req, res) => {
  res.setHeader('access-control-allow-origin', '*'); res.setHeader('access-control-allow-headers', '*');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  let body = '';
  req.on('data', (c) => (body += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    const m = u.pathname.match(/terrarium\/(\d+)\/(\d+)\/(\d+)\.png/);
    const v = u.pathname.match(/\/vt\/(\d+)\/(\d+)\/(\d+)\.pbf/);
    if (u.pathname === '/planet') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ tiles: ['http://localhost:3200/vt/{z}/{x}/{y}.pbf'], maxzoom: 14 })); }
    if (v) { global.vt = (global.vt || 0) + 1; res.setHeader('content-type', 'application/x-protobuf'); return res.end(mvt(+v[1], +v[2], +v[3])); }
    if (m) { global.tiles = (global.tiles || 0) + 1; res.setHeader('content-type', 'image/png'); return res.end(png(+m[1], +m[2], +m[3])); }
    if (u.pathname === '/stats') return res.end(JSON.stringify({ tiles: global.tiles || 0, elev: global.elev || 0, vt: global.vt || 0, overpass: global.op || 0 }));
    if (u.pathname.endsWith('/elevation')) { global.elev = (global.elev || 0) + 1;
      const la = u.searchParams.get('latitude').split(',').map(Number), lo = u.searchParams.get('longitude').split(',').map(Number);
      res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ elevation: la.map((a, i) => Math.round(z(a, lo[i]) * 10) / 10) }));
    }
    global.op = (global.op || 0) + 1;
    const q = decodeURIComponent(new URLSearchParams(body).get('data') || '');
    let els = [];
    if (/highway=steps/.test(q)) els = steps; else if (/highway~/.test(q)) els = ways;
    else if (/fitness/.test(q)) els = fitness; else if (/leisure=track/.test(q)) els = track; else if (/drinking_water/.test(q)) els = water;
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ elements: els }));
  });
}).listen(3200, () => console.log('mock ready', JSON.stringify(C)));
