import { describe, it, expect } from 'vitest';
import { runInvariants } from './invariant.js';
import { L2Error } from './types.js';
import type { SemNode, SemanticsDump, Violation } from './types.js';

// T3.4 自带 builder(不动 t25):入参为 dp,px=dp×2;touchBounds 默认=几何盒;invariant 新字段经 extra 注入。
const P = 2; // density
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
/** invariant 新字段以 dp 声明,转 px 注入 extra。 */
const bpx = (x: number, y: number, w: number, h: number): { left: number; top: number; right: number; bottom: number } =>
  ({ left: x * P, top: y * P, right: (x + w) * P, bottom: (y + h) * P });
function dumpX(kids: SemNode[], graphicsMode?: string): SemanticsDump {
  const root = semX(null, null, 0, 0, 360, 200, { children: kids });
  return graphicsMode !== undefined ? { density: 2.0, root, graphicsMode } : { density: 2.0, root };
}
const props = (vs: Violation[]): string[] => vs.map((v) => v.property);

describe('runInvariants(L2-invariant 免基准套件,设计 3.3)', () => {
  it('childClipped:高被父裁半→1 条(expected=unclipped/actual=clipped);差≤0.5dp→无;缺 boundsInRoot→不计数', () => {
    const clipped = runInvariants(dumpX([semX('c', null, 0, 180, 100, 40, { boundsInRoot: bpx(0, 180, 100, 20) })]));
    expect(props(clipped.violations)).toEqual(['childClipped']);
    expect(clipped.violations[0]?.expected).toBe('(0,180,100,220)dp');   // unclipped 盒
    expect(clipped.violations[0]?.actual).toBe('(0,180,100,200)dp');     // clipped 盒
    expect(clipped.violations[0]?.judgePath).toBe('invariant');
    expect(clipped.violations[0]?.severity).toBe('high');
    expect(clipped.executed).toBe(1);

    const within = runInvariants(dumpX([semX('c', null, 0, 180, 100, 40, { boundsInRoot: bpx(0, 180, 100, 39.5) })]));
    expect(within.violations).toHaveLength(0);   // bottom 差恰 0.5dp,不 >0.5
    expect(within.executed).toBe(1);

    const absent = runInvariants(dumpX([semX('c', null, 0, 180, 100, 40)]));
    expect(absent.violations).toHaveLength(0);
    expect(absent.executed).toBe(0);             // 无 boundsInRoot → childClipped 不执行不计数
  });

  it('siblingOverlap:交叠 60×20dp→1 条(同对一次);贴边 0→无;交叠宽=1dp→无', () => {
    const over = runInvariants(dumpX([semX('a', null, 10, 10, 100, 20), semX('b', null, 50, 10, 100, 20)]));
    expect(props(over.violations)).toEqual(['siblingOverlap']);
    expect(over.executed).toBe(1);               // C(2,2)=1 对

    const edge = runInvariants(dumpX([semX('a', null, 10, 10, 100, 20), semX('b', null, 110, 10, 100, 20)]));
    expect(edge.violations).toHaveLength(0);      // 贴边交叠 0

    const thin = runInvariants(dumpX([semX('a', null, 10, 10, 100, 20), semX('b', null, 109, 10, 100, 20)]));
    expect(thin.violations).toHaveLength(0);      // 交叠宽 1dp,不 >OVERLAP_MIN_DP
  });

  it('touchTargetTooSmall:clickable+触控40×40→1 条;CS3 反证(几何20×20 但触控48×48外扩)→无;非 clickable→无', () => {
    // 带 cd 隔离 touch 判定(clickable 节点 executed = touch 1 + missingCd 1 = 2)。
    const small = runInvariants(dumpX([semX('t', null, 0, 0, 40, 40, { clickable: true, contentDescription: '按钮' })]));
    expect(props(small.violations)).toEqual(['touchTargetTooSmall']);
    expect(small.violations[0]?.expected).toBe('>=48x48dp');
    expect(small.executed).toBe(2);

    // CS3 反证:layout 几何 20×20 会误杀,必须读 touchBoundsInRoot(框架自动外扩到 48×48)
    const cs3 = runInvariants(dumpX([semX('t', null, 0, 0, 20, 20,
      { clickable: true, contentDescription: '按钮', touchBoundsInRoot: bpx(0, 0, 48, 48) })]));
    expect(cs3.violations).toHaveLength(0);
    expect(cs3.executed).toBe(2);

    const notClickable = runInvariants(dumpX([semX('t', null, 0, 0, 40, 40, { clickable: false })]));
    expect(notClickable.violations).toHaveLength(0);
    expect(notClickable.executed).toBe(0);        // 非 clickable → touch/missingCd 均不执行
  });

  it('missingContentDescription:图标钮(cd null,子树无 text)→1 条;文本钮(后代有 text)→无;兄弟有 text→仍 1 条;cd 非空→无', () => {
    const icon = runInvariants(dumpX([semX('btn', null, 0, 0, 48, 48, { clickable: true, contentDescription: null })]));
    expect(props(icon.violations)).toEqual(['missingContentDescription']);

    // 文本按钮:text 是其后代 → 有可及名 → 豁免
    const textBtn = runInvariants(dumpX([semX('btn', null, 0, 0, 48, 48,
      { clickable: true, contentDescription: null, children: [semX('lbl', 'Submit', 4, 4, 40, 20)] })]));
    expect(textBtn.violations).toHaveLength(0);

    // 图标按钮 + 同级兄弟标签(text 非其后代)→ 兄弟文本不豁免 → 仍 1 条(收窄口径②)
    const sibling = runInvariants(dumpX([
      semX('btn', null, 0, 0, 48, 48, { clickable: true, contentDescription: null }),
      semX('lbl', 'Info', 60, 0, 100, 20),
    ]));
    expect(props(sibling.violations)).toEqual(['missingContentDescription']);

    const named = runInvariants(dumpX([semX('btn', null, 0, 0, 48, 48, { clickable: true, contentDescription: '头像' })]));
    expect(named.violations).toHaveLength(0);
  });

  it('textOverflow:NATIVE+overflow→1 条 high(hard-gate);非 NATIVE+overflow→advisory(不入 violations);null/缺省→不计数', () => {
    const native = runInvariants(dumpX([semX('title', 'Long', 0, 0, 150, 20, { hasVisualOverflow: true })], 'NATIVE'));
    expect(props(native.violations)).toEqual(['textOverflow']);
    expect(native.violations[0]?.severity).toBe('high');
    expect(native.advisories).toHaveLength(0);
    expect(native.executed).toBe(1);

    const legacy = runInvariants(dumpX([semX('title', 'Long', 0, 0, 150, 20, { hasVisualOverflow: true })], 'LEGACY'));
    expect(legacy.violations).toHaveLength(0);     // 环境未钉住 → 降 advisory
    expect(legacy.advisories).toEqual([{ property: 'textOverflow', testTag: 'title', reason: 'native_graphics_unverified' }]);
    expect(legacy.executed).toBe(1);

    const defaultMode = runInvariants(dumpX([semX('title', 'Long', 0, 0, 150, 20, { hasVisualOverflow: true })]));
    expect(defaultMode.violations).toHaveLength(0);  // graphicsMode 缺省 ≠ NATIVE → advisory
    expect(defaultMode.advisories).toHaveLength(1);

    const noOverflow = runInvariants(dumpX([semX('title', 'Short', 0, 0, 150, 20)], 'NATIVE'));
    expect(noOverflow.violations).toHaveLength(0);
    expect(noOverflow.executed).toBe(0);            // hasVisualOverflow 缺省 → textOverflow 不计数
  });

  it('确定性 + executed 计数:组合 fixture 两次调用 toEqual,executed 恰为各规则计数之和', () => {
    const fixture = (): SemanticsDump => dumpX([
      semX('clip', null, 0, 100, 100, 40, { boundsInRoot: bpx(0, 100, 100, 20) }),        // childClipped exec+1 violate
      semX('btn', null, 200, 0, 40, 40, { clickable: true, contentDescription: null }),   // touch exec+1 violate, missingCd exec+1 violate
      semX('title', 'Long', 0, 0, 150, 20, { hasVisualOverflow: true }),                  // textOverflow exec+1 violate
    ], 'NATIVE');
    const r1 = runInvariants(fixture());
    const r2 = runInvariants(fixture());
    expect(r1).toEqual(r2);                          // 确定性
    // executed = sibling C(3,2)=3 + clip 1 + touch 1 + missingCd 1 + textOverflow 1 = 7
    expect(r1.executed).toBe(7);
    expect(props(r1.violations).sort()).toEqual(['childClipped', 'missingContentDescription', 'textOverflow', 'touchTargetTooSmall']);
    expect(r1.violations.every((v) => v.judgePath === 'invariant' && v.severity === 'high')).toBe(true);
  });

  it('density≠2 → 抛 L2Error(render_harness_error)', () => {
    const bad: SemanticsDump = { density: 3.0, root: semX(null, null, 0, 0, 360, 200) };
    expect(() => runInvariants(bad)).toThrow(L2Error);
    try { runInvariants(bad); } catch (e) { expect((e as L2Error).subReason).toBe('render_harness_error'); }
  });
});
