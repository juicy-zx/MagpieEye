// check-scale.mjs <png> <expectedFigmaW> <expectedFigmaH> <scale>
// 读 PNG IHDR 实际像素宽高,断言 |实际 − 期望Figma单位×scale| ≤ 2px
import { readFileSync } from 'node:fs';
const [png, ewArg, ehArg, sArg] = process.argv.slice(2);
if (!png || !ewArg || !ehArg || !sArg) {
  console.error('usage: check-scale.mjs <png> <figmaW> <figmaH> <scale>'); process.exit(64);
}
const buf = readFileSync(png);
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
if (!buf.subarray(0, 8).equals(SIG)) { console.error('not a PNG'); process.exit(1); }
if (buf.toString('ascii', 12, 16) !== 'IHDR') { console.error('IHDR not first chunk'); process.exit(1); }
const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
const ew = Number(ewArg) * Number(sArg), eh = Number(ehArg) * Number(sArg);
const dw = Math.abs(w - ew), dh = Math.abs(h - eh);
const pass = dw <= 2 && dh <= 2;
console.log(JSON.stringify({ png, actualPx: [w, h], expectedPx: [ew, eh], deltaPx: [dw, dh], tolerancePx: 2, pass }));
process.exit(pass ? 0 : 1);
