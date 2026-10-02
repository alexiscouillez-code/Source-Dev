import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, checksum]);
}

function ridge(nx) {
  const points = [
    [0, 0.74],
    [0.22, 0.58],
    [0.4, 0.3],
    [0.55, 0.48],
    [0.74, 0.28],
    [1, 0.66],
  ];
  for (let index = 0; index < points.length - 1; index += 1) {
    const left = points[index];
    const right = points[index + 1];
    if (nx >= left[0] && nx <= right[0]) {
      const span = right[0] - left[0];
      const ratio = span === 0 ? 0 : (nx - left[0]) / span;
      return left[1] + (right[1] - left[1]) * ratio;
    }
  }
  return 0.7;
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const nx = x / (size - 1);
      const ny = y / (size - 1);
      const line = ridge(nx);
      let red = 7;
      let green = 9;
      let blue = 12;
      if (ny > line && ny < 0.9) {
        red = 16;
        green = 32;
        blue = 36;
      }
      if (ny >= line - 0.012 && ny <= line + 0.012) {
        red = 62;
        green = 224;
        blue = 197;
      }
      raw[offset] = red;
      raw[offset + 1] = green;
      raw[offset + 2] = blue;
      raw[offset + 3] = 255;
      offset += 4;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const publicDir = path.join(process.cwd(), "public", "icons");
mkdirSync(publicDir, { recursive: true });
const icon192 = png(192);
const icon512 = png(512);
writeFileSync(path.join(publicDir, "icon-192.png"), icon192);
writeFileSync(path.join(publicDir, "icon-512.png"), icon512);
writeFileSync(path.join(process.cwd(), "src", "app", "icon.png"), icon192);
