#!/usr/bin/env node
// T1.1:汇总 NATIVE/LEGACY 文本度量探针 → meta.json.text_metrics(决定文本溢出 invariant 门禁形态)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = '/Users/zhuxi/AI/magpie_eye';
const PROBE_DIR = `${ROOT}/demo-android/app/build/text-metrics`;
const META = `${ROOT}/.claude/plans/magpie-eye-full-impl/meta.json`;

function probe(name) {
  const p = `${PROBE_DIR}/${name}`;
  if (!existsSync(p)) { console.error(`missing probe: ${p}`); process.exit(1); }
  return JSON.parse(readFileSync(p, 'utf8'));
}

const nc = probe('native-compose.json');
const nt = probe('native-textview.json');
const lc = probe('legacy-compose.json');
const lt = probe('legacy-textview.json');

const gate = nc.hasVisualOverflow === true && nt.ellipsisCount > 0 ? 'hard-gate' : 'advisory';

const meta = JSON.parse(readFileSync(META, 'utf8'));
meta.text_metrics = {
  task: 'T1.1',
  robolectric: '4.16',
  graphics_mode_pinned: 'NATIVE',
  native: { hasVisualOverflow: nc.hasVisualOverflow, textViewEllipsisCount: nt.ellipsisCount },
  legacy: {
    hasVisualOverflow: lc.hasVisualOverflow,
    textViewEllipsisCount: lt.ellipsisCount,
    errors: [lc.error, lt.error].filter(Boolean),
  },
  text_overflow_invariant: gate, // hard-gate: T1.3/T3.4 可进硬门禁;advisory: 永久 advisory(设计文档 CS1/CS2)
};
writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
console.log(`text_overflow_invariant = ${gate}`);
process.exit(gate === 'hard-gate' ? 0 : 2);
