// Generates a 1024x1024 "moon" source icon (no deps) for `tauri icon`.
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const S = 1024;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Palette
const bg = [11, 12, 16]; // near-black
const moonCore = [201, 184, 255];
const moonMid = [124, 92, 255];
const moonEdge = [58, 42, 140];

const cx = S * 0.5;
const cy = S * 0.5;
const R = S * 0.40;

const raw = Buffer.alloc(S * (1 + S * 4)); // 1 filter byte per row + RGBA
let p = 0;
for (let y = 0; y < S; y++) {
  raw[p++] = 0; // filter: none
  for (let x = 0; x < S; x++) {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    let r, g, b, a;
    if (d > R + 1.5) {
      [r, g, b] = bg;
      a = 255;
    } else {
      // radial gradient with light source upper-left
      const lx = x - (cx - R * 0.35);
      const ly = y - (cy - R * 0.35);
      const ld = Math.min(1, Math.sqrt(lx * lx + ly * ly) / (R * 1.5));
      let col;
      if (ld < 0.5) col = moonCore.map((c, i) => lerp(c, moonMid[i], ld / 0.5));
      else col = moonMid.map((c, i) => lerp(c, moonEdge[i], (ld - 0.5) / 0.5));
      // anti-alias the rim
      const edge = R + 1.5 - d;
      a = Math.max(0, Math.min(1, edge / 2)) * 255;
      [r, g, b] = col.map((c) => Math.round(c));
      // composite over bg using alpha
      const af = a / 255;
      r = Math.round(lerp(bg[0], r, af));
      g = Math.round(lerp(bg[1], g, af));
      b = Math.round(lerp(bg[2], b, af));
      a = 255;
    }
    raw[p++] = r;
    raw[p++] = g;
    raw[p++] = b;
    raw[p++] = a;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// CRC32
const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(__dirname, "..", "app-icon.png");
fs.writeFileSync(out, png);
console.log("Wrote", out, png.length, "bytes");
