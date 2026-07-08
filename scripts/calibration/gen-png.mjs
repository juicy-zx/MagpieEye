// gen-png.mjs <out.png> <width> <height> <variant: a|b>
// 生成 8-bit RGBA PNG:渐变底;variant b 在 (300,700) 处叠一块 100x100 纯橙差异区
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let t = crc32.t;
  if (!t) {
    t = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const [out, wArg, hArg, variant] = process.argv.slice(2);
const w = Number(wArg), h = Number(hArg);
if (!out || !w || !h || !['a', 'b'].includes(variant)) {
  console.error('usage: gen-png.mjs <out.png> <w> <h> <a|b>'); process.exit(64);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, color type 6 (RGBA)
const raw = Buffer.alloc(h * (1 + w * 4));
for (let y = 0; y < h; y++) {
  const row = y * (1 + w * 4); // 行首 filter byte = 0
  for (let x = 0; x < w; x++) {
    const o = row + 1 + x * 4;
    const inBlock = variant === 'b' && x >= 300 && x < 400 && y >= 700 && y < 800;
    raw[o] = inBlock ? 255 : (x * 255 / w) | 0;
    raw[o + 1] = inBlock ? 153 : (y * 255 / h) | 0;
    raw[o + 2] = inBlock ? 0 : 128;
    raw[o + 3] = 255;
  }
}
writeFileSync(out, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log(`wrote ${out} ${w}x${h} variant=${variant}`);
