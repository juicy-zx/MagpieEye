import { describe, it, expect } from 'vitest';
import { runInvariants } from './invariant.js';
import type { SemNode, SemanticsDump } from './types.js';

// T3.5 ⑤ 内容态反例（uiv-core 单元层）：合成 semantics 树，禁真渲染，纯 JSON 进出、确定性。
// builder 与 invariant.test.ts 同：入参 dp，px=dp×2；invariant 新字段经 extra 注入。
const P = 2;
function semX(tag: string | null, text: string | null, x: number, y: number, w: number, h: number,
              extra: Partial<SemNode> = {}): SemNode {
  return {
    testTag: tag, text,
    positionInRoot: { x: x * P, y: y * P }, size: { width: w * P, height: h * P },
    touchBoundsInRoot: { left: x * P, top: y * P, right: (x + w) * P, bottom: (y + h) * P },
    colorHex: null, fontSizeSp: null, cornerRadiusPx: null, children: [],
    ...extra,
  };
}
const bpx = (x: number, y: number, w: number, h: number): { left: number; top: number; right: number; bottom: number } =>
  ({ left: x * P, top: y * P, right: (x + w) * P, bottom: (y + h) * P });
function dumpX(kids: SemNode[], graphicsMode?: string): SemanticsDump {
  const root = semX(null, null, 0, 0, 360, 200, { children: kids });
  return graphicsMode !== undefined ? { density: 2.0, root, graphicsMode } : { density: 2.0, root };
}

describe('T3.5 ⑤ 内容态反例：longText 溢出 → L2-invariant fail（合成 dump，纯 JSON）', () => {
  it('超长文案内容态：子节点被父裁 + NATIVE 可视溢出 → childClipped + textOverflow（均 high），verdict=fail', () => {
    // 故意超长串（种子固定）模拟 longText 内容态渲染结果：unclipped 盒 (16,16,344,40)dp，
    // 被父裁到 bottom=32dp（差 8dp>CLIP_TOL_DP），且 NATIVE 下 hasVisualOverflow=true（文本 ellipsis）。
    const longText = 'A'.repeat(300);
    const dump = dumpX([
      semX('longText', longText, 16, 16, 328, 24, { hasVisualOverflow: true, boundsInRoot: bpx(16, 16, 328, 16) }),
    ], 'NATIVE');

    const result = runInvariants(dump);

    const props = result.violations.map((v) => v.property).sort();
    expect(props).toEqual(['childClipped', 'textOverflow']);
    expect(result.violations.every((v) => v.severity === 'high')).toBe(true);
    expect(result.violations.every((v) => v.judgePath === 'invariant')).toBe(true);
    // verdict：口径① invariant-only pass/fail 只看有无 high/blocking 违规 → 有 high → fail。
    const verdictFail = result.violations.some((v) => v.severity === 'high' || v.severity === 'blocking');
    expect(verdictFail).toBe(true);
    expect(result.executed).toBe(2); // childClipped(1) + textOverflow(1)；单子节点无 siblingOverlap 对
  });

  it('对照：无溢出内容态（bounds 未被裁 + 无 hasVisualOverflow）→ 无 violation，verdict=pass', () => {
    // 反证 ⑤ 的判定不是恒 fail：几何可比的默认内容态（fixture 注入不破坏几何，T3.4 验收已含，此处仅取对照）。
    const dump = dumpX([semX('title', '正常文案', 16, 16, 200, 24)], 'NATIVE');
    const result = runInvariants(dump);
    expect(result.violations).toHaveLength(0);
  });
});
