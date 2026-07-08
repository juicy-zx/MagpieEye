#!/usr/bin/env node
// T1.0b(T1.1 内):渲染 PNG 像素尺寸 ↔ 期望值(360x200dp x density2)↔ T1.0a Figma 标定值
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/zhuxi/AI/magpie_eye';
const PNG = `${ROOT}/demo-android/app/build/outputs/roborazzi/CalibCard.png`;
const META = `${ROOT}/.claude/plans/magpie-eye-full-impl/meta.json`;
const EXPECTED = { width: 720, height: 400 }; // 360x200dp * 2.0(xhdpi)
const TOLERANCE = 2; // 与 T1.0a 机判脚本同容差(|Δ|<=2px)

const buf = readFileSync(PNG);
if (buf.readUInt32BE(12) !== 0x49484452) { // "IHDR"
  console.error('not a valid PNG (IHDR missing)');
  process.exit(1);
}
const w = buf.readUInt32BE(16);
const h = buf.readUInt32BE(20);
console.log(`rendered: ${w}x${h}px, expected: ${EXPECTED.width}x${EXPECTED.height}px`);

const meta = JSON.parse(readFileSync(META, 'utf8'));
// T1.0a 落盘的 2x 截图像素尺寸;实际键名为 calibration.scale2_px.actual([w,h] 数组)
const sc = meta.calibration && meta.calibration.scale2_px;
const fig = sc && Array.isArray(sc.actual) ? { width: sc.actual[0], height: sc.actual[1] } : null;
if (fig) console.log(`figma 2x png (T1.0a): ${fig.width}x${fig.height}px`);
else console.log('warning: meta.calibration 无 scale2_px.actual 键,仅与常量 720x400 对比');

const near = (a, b) => Math.abs(a - b) <= TOLERANCE;
const ok = near(w, EXPECTED.width) && near(h, EXPECTED.height)
  && (!fig || (near(w, fig.width) && near(h, fig.height)));

meta.calibration_render = {
  task: 'T1.1/T1.0b',
  rendered_px: { width: w, height: h },
  expected_px: EXPECTED,
  figma_2x_px: fig,
  tolerance_px: TOLERANCE,
  density_aligned: ok,
};
writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
console.log(`density_aligned = ${ok}`);
process.exit(ok ? 0 : 1);
