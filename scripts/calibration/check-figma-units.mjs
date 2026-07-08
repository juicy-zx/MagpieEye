// check-figma-units.mjs <metadata.raw.xml>
// 断言 get_metadata 报告的宽高(Figma 单位)与设计值(dp 名义值)一致(±0.5)
// 与 check-scale(px = 单位×2)合并 ⇒ "1 Figma 单位 = 1dp @ density 2.0" Figma 侧成立
import { readFileSync } from 'node:fs';
const xml = readFileSync(process.argv[2], 'utf8');
function attrs(name) {
  const m = xml.match(new RegExp(`<[^>]*name="${name}"[^>]*>`));
  if (!m) return null;
  const num = (k) => {
    const a = m[0].match(new RegExp(`(?:^|\\s)${k}="(-?[\\d.]+)"`));
    return a ? Number(a[1]) : null;
  };
  return { x: num('x'), y: num('y'), width: num('width'), height: num('height') };
}
const EXPECT = [['CalibCard', 360, 200], ['CalibSwatch', 80, 40]];
const TOL = 0.5;
let fail = 0;
const results = EXPECT.map(([name, w, h]) => {
  const n = attrs(name);
  if (!n || n.width == null || n.height == null) { fail++; return { name, error: 'node or w/h attrs not found' }; }
  const ok = Math.abs(n.width - w) <= TOL && Math.abs(n.height - h) <= TOL;
  if (!ok) fail++;
  return { name, expectedUnits: [w, h], actualUnits: [n.width, n.height], ok };
});
console.log(JSON.stringify({ results, pass: fail === 0 }));
process.exit(fail === 0 ? 0 : 1);
