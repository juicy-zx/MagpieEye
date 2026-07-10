/**
 * T4.4 commit1 验收门:touchBoundsInRoot/touchBoundsDp 放宽为可缺席(null/omit)。
 * 语义:触控盒缺席是纯可用性判断(非几何/语义),touchTarget 门缺席即跳过;
 * missingContentDescription 不依赖触控盒,继续正常承重。全填触控盒的现有路径零影响。
 */
import { describe, it, expect } from 'vitest';
import { toDp, joinByTag } from './join.js';
import { runInvariants } from './invariant.js';
import type { FigmaNode, SemNode, SemanticsDump, Violation } from './types.js';

const P = 2; // density
type TB = { left: number; top: number; right: number; bottom: number };
const bpx = (x: number, y: number, w: number, h: number): TB =>
  ({ left: x * P, top: y * P, right: (x + w) * P, bottom: (y + h) * P });

interface Opts {
  touch?: TB | null | 'omit';   // 缺省=几何盒;null=显式 null;'omit'=字段不产
  children?: SemNode[];
  clickable?: boolean;
  contentDescription?: string | null;
}
function sem(tag: string | null, text: string | null, x: number, y: number, w: number, h: number, opts: Opts = {}): SemNode {
  const touch: TB | null = opts.touch === undefined ? bpx(x, y, w, h) : (opts.touch as TB | null);
  return {
    testTag: tag, text,
    positionInRoot: { x: x * P, y: y * P }, size: { width: w * P, height: h * P },
    colorHex: null, fontSizeSp: null, cornerRadiusPx: null,
    children: opts.children ?? [],
    ...(opts.touch === 'omit' ? {} : { touchBoundsInRoot: touch }),
    ...(opts.clickable !== undefined ? { clickable: opts.clickable } : {}),
    ...(opts.contentDescription !== undefined ? { contentDescription: opts.contentDescription } : {}),
  };
}
function dumpOf(kids: SemNode[]): SemanticsDump {
  return { density: 2.0, root: sem(null, null, 0, 0, 360, 200, { children: kids }) };
}
const props = (vs: Violation[]): string[] => vs.map((v) => v.property);

describe('T4.4 commit1:touchBounds 可缺席放宽', () => {
  it('a) null/omit 在根/中层/叶各层级走 toDp/runInvariants/joinByTag 均不抛异常', () => {
    // 根 omit → 中层 null → 叶 omit
    const leaf = sem('fig:leaf', 'x', 4, 4, 20, 20, { touch: 'omit' });
    const mid = sem('fig:mid', null, 0, 40, 50, 20, { touch: null, children: [leaf] });
    const root = sem(null, null, 0, 0, 360, 200, { touch: 'omit', children: [mid] });
    const dump: SemanticsDump = { density: 2.0, root };

    expect(() => toDp(root, 2.0)).not.toThrow();       // 根 omit + 递归 null/omit
    expect(() => runInvariants(dump)).not.toThrow();    // 全管线(内部 toDp 全树)

    // joinByTag:匹配 mid(null)与 leaf(omit)→ 对匹配子树跑 toDp
    const fig: FigmaNode = {
      id: 'root', name: 'root', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 360, height: 200 },
      children: [
        { id: 'mid', name: 'mid', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 20, width: 25, height: 10 },
          children: [{ id: 'leaf', name: 'leaf', type: 'TEXT', absoluteBoundingBox: { x: 2, y: 22, width: 10, height: 10 } }] },
      ],
    };
    expect(() => joinByTag(fig, dump)).not.toThrow();

    // 根 null 单节点
    const rootNull: SemanticsDump = { density: 2.0, root: sem(null, null, 0, 0, 360, 200, { touch: null }) };
    expect(() => toDp(rootNull.root, 2.0)).not.toThrow();
    expect(() => runInvariants(rootNull)).not.toThrow();
  });

  it('b) clickable + touchBounds 缺席 + cd 存在 → touchTarget 与 missingCd 两 high 都不产', () => {
    const r = runInvariants(dumpOf([sem('fig:btn', null, 0, 0, 40, 40, { touch: 'omit', clickable: true, contentDescription: '按钮' })]));
    expect(r.violations).toHaveLength(0);
    expect(r.executed).toBe(1);            // touchTarget 缺席跳过(不计数);仅 missingCd 执行
  });

  it('c) clickable + touchBounds 缺席 + cd 缺失 → 只产 missingContentDescription(不产 touchTarget)', () => {
    const r = runInvariants(dumpOf([sem('fig:btn', null, 0, 0, 40, 40, { touch: 'omit', clickable: true, contentDescription: null })]));
    expect(props(r.violations)).toEqual(['missingContentDescription']);
    expect(r.executed).toBe(1);            // touchTarget 跳过;仅 missingCd 执行并承重
  });

  it('d) clickable + touchBounds=24dp 视觉盒(<48dp)→ 仍产 touchTarget high(有值门照常承重,回归保护)', () => {
    const r = runInvariants(dumpOf([sem('fig:btn', null, 0, 0, 24, 24, { touch: bpx(0, 0, 24, 24), clickable: true, contentDescription: '按钮' })]));
    expect(props(r.violations)).toEqual(['touchTargetTooSmall']);
    expect(r.violations[0]?.severity).toBe('high');
    expect(r.violations[0]?.actual).toBe('24x24dp');
    expect(r.executed).toBe(2);            // touchTarget + missingCd
  });
});
