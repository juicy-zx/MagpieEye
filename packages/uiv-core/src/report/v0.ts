/**
 * report.json v0 schema + 手写校验器(T1.2 Step 5;字段少,不引 zod)。
 * v0 无 L2:pass = 渲染管线成功;L1 结果只进 pixel 字段(advisory),不参与判定。
 */
export interface Cluster { x: number; y: number; w: number; h: number }
export interface PixelResult { diffRatio: number; diffCount: number; clusters: Cluster[] }
export interface ReportV0 {
  schemaVersion: 0;
  pass: boolean;
  reason: 'inconclusive' | null;
  subReason: 'render_harness_error' | 'figma_spec_invalid' | null;
  compileError: string | null;
  pixel: PixelResult | null;                       // advisory,不参与 pass
  artifacts: { baseline: string | null; render: string | null; diff: string | null };
}

function fail(path: string, want: string, got: unknown): never {
  throw new Error(`report.json v0 invalid at ${path}: expected ${want}, got ${JSON.stringify(got)}`);
}

function checkNumber(v: unknown, path: string): number {
  if (typeof v !== 'number') fail(path, 'number', v);
  return v;
}

function checkStringOrNull(v: unknown, path: string): string | null {
  if (v !== null && typeof v !== 'string') fail(path, 'string | null', v);
  return v;
}

function checkPixel(v: unknown, path: string): PixelResult | null {
  if (v === null) return null;
  if (typeof v !== 'object') fail(path, 'object | null', v);
  const p = v as Record<string, unknown>;
  checkNumber(p['diffRatio'], `${path}.diffRatio`);
  checkNumber(p['diffCount'], `${path}.diffCount`);
  if (!Array.isArray(p['clusters'])) fail(`${path}.clusters`, 'array', p['clusters']);
  (p['clusters'] as unknown[]).forEach((c, i) => {
    if (c === null || typeof c !== 'object') fail(`${path}.clusters[${i}]`, 'object', c);
    const cc = c as Record<string, unknown>;
    for (const k of ['x', 'y', 'w', 'h'] as const) checkNumber(cc[k], `${path}.clusters[${i}].${k}`);
  });
  return v as PixelResult;
}

export function validateReportV0(x: unknown): ReportV0 {
  if (x === null || typeof x !== 'object') fail('$', 'object', x);
  const r = x as Record<string, unknown>;

  if (r['schemaVersion'] !== 0) fail('schemaVersion', '0', r['schemaVersion']);
  if (typeof r['pass'] !== 'boolean') fail('pass', 'boolean', r['pass']);
  if (r['reason'] !== null && r['reason'] !== 'inconclusive') {
    fail('reason', "'inconclusive' | null", r['reason']);
  }
  if (r['subReason'] !== null && r['subReason'] !== 'render_harness_error' && r['subReason'] !== 'figma_spec_invalid') {
    fail('subReason', "'render_harness_error' | 'figma_spec_invalid' | null", r['subReason']);
  }
  checkStringOrNull(r['compileError'], 'compileError');
  checkPixel(r['pixel'], 'pixel');
  if (r['artifacts'] === null || typeof r['artifacts'] !== 'object') {
    fail('artifacts', '{ baseline, render, diff }', r['artifacts']);
  }
  const a = r['artifacts'] as Record<string, unknown>;
  for (const k of ['baseline', 'render', 'diff'] as const) checkStringOrNull(a[k], `artifacts.${k}`);

  // 组合约束
  if (r['reason'] === 'inconclusive' && r['subReason'] === null) {
    fail('subReason', "non-null when reason === 'inconclusive'", r['subReason']);
  }
  if (r['pass'] === true && r['compileError'] !== null) {
    fail('compileError', 'null when pass === true', r['compileError']);
  }
  if (r['pass'] === true && r['reason'] !== null) {
    fail('reason', 'null when pass === true', r['reason']);
  }
  return x as ReportV0;
}
