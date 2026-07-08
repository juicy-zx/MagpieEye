// check-coords.mjs <metadata.raw.xml>
// CalibSwatch 设计相对位置 (12,60),父 frame 画布位置 (100,100)。
// 报告 x≈12 ⇒ relative-to-parent;x≈112 ⇒ absolute;皆非 ⇒ ambiguous(exit 2 → Codex)
import { readFileSync } from 'node:fs';
const xml = readFileSync(process.argv[2], 'utf8');
function attrs(name) {
  const m = xml.match(new RegExp(`<[^>]*name="${name}"[^>]*>`));
  if (!m) return null;
  const num = (k) => {
    const a = m[0].match(new RegExp(`(?:^|\\s)${k}="(-?[\\d.]+)"`));
    return a ? Number(a[1]) : null;
  };
  return { x: num('x'), y: num('y') };
}
const frame = attrs('CalibCard'), swatch = attrs('CalibSwatch');
if (!frame || !swatch || frame.x == null || swatch.x == null) {
  console.error('nodes or x/y attrs not found'); process.exit(3);
}
const TOL = 0.5;
const relOK = Math.abs(swatch.x - 12) <= TOL && Math.abs(swatch.y - 60) <= TOL;
const absOK = Math.abs(swatch.x - (frame.x + 12)) <= TOL && Math.abs(swatch.y - (frame.y + 60)) <= TOL;
let verdict = null;
if (relOK && !absOK) verdict = 'relative-to-parent';
else if (absOK && !relOK) verdict = 'absolute';
const out = { frame: { x: frame.x, y: frame.y }, swatch: { x: swatch.x, y: swatch.y }, verdict: verdict ?? 'ambiguous' };
console.log(JSON.stringify(out));
process.exit(verdict ? 0 : 2);
