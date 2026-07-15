/**
 * L2-invariant 免基准套件(T3.4,设计文档 3.3 节)。免 Figma 基准的内容态自洽性检查。
 * 五不变量:childClipped / siblingOverlap / touchTargetTooSmall / missingContentDescription / textOverflow。
 * DFS 前序;每节点按 [childClipped, touchTarget, missingCd, textOverflow] 序执行,
 * siblingOverlap 在父访问时按子序枚举 C(k,2) 对。
 * violations:judgePath:'invariant',severity 一律 'high'(3.3 默认),figmaName=testTag??text??'(sem)',
 * hint=本模块确定性模板(不走 makeHint,无 figma 侧期望值)。density≠2 → 抛 L2Error('render_harness_error')。
 */
import { CLIP_TOL_DP, DENSITY, OVERLAP_MIN_DP, TOUCH_TARGET_MIN_DP } from './constants.js';
import { toDp } from './join.js';
import { L2Error } from './types.js';
import type { SemDp, SemNode, SemanticsDump, Violation } from './types.js';

export interface InvariantAdvisory { property: string; testTag: string | null; reason: 'native_graphics_unverified' | 'expected_unsupported' }
export interface InvariantResult { violations: Violation[]; executed: number; advisories: InvariantAdvisory[] }

const HINTS: Record<string, string> = {
  childClipped: '子节点溢出父容器被裁剪:检查尺寸/约束或父容器可用空间',
  siblingOverlap: '兄弟节点相互重叠:检查布局定位/尺寸,避免元素遮挡',
  touchTargetTooSmall: `可点击目标触控区不足 ${TOUCH_TARGET_MIN_DP}x${TOUCH_TARGET_MIN_DP}dp:增大触控区(minimumInteractiveComponentSize 或尺寸)`,
  missingContentDescription: '可点击节点缺少内容描述:补 contentDescription 以提供无障碍可及名',
  textOverflow: '文本可视溢出被截断:检查 maxLines/宽度约束或缩短文案',
};

type Rect = { left: number; top: number; right: number; bottom: number };
const box = (n: SemDp): Rect =>
  ({ left: n.positionDp.x, top: n.positionDp.y, right: n.positionDp.x + n.sizeDp.width, bottom: n.positionDp.y + n.sizeDp.height });
const label = (n: SemDp): string => n.testTag ?? n.text ?? '(sem)';

function mkViolation(n: SemDp, property: string, expected: string, actual: string): Violation {
  return {
    judgePath: 'invariant', testTag: n.testTag ?? '(sem)', figmaName: label(n),
    property, expected, actual, severity: 'high', hint: HINTS[property] ?? property,
  };
}

/** 该 clickable 节点自身子树(含自身)内是否有非空可见文本(收窄口径②:后代计入,兄弟不计)。 */
function hasTextInSubtree(n: SemDp): boolean {
  if (n.text !== null && n.text !== '') return true;
  return n.children.some(hasTextInSubtree);
}

export function runInvariants(dump: SemanticsDump): InvariantResult {
  if (dump.density !== DENSITY) throw new L2Error('render_harness_error');
  const root = toDp(dump.root, dump.density);
  const nativeMode = dump.graphicsMode === 'NATIVE';
  // producer 判据(dump 顶层无 producer 标记):root.touchBoundsInRoot==null ⇒ ViewDump(ViewDumpRule.kt:87 全节点硬 null),
  // 非空 ⇒ SemanticsDump(Compose SemanticsDumpRule.kt:56 每节点恒产真值)。touchBoundsInRoot 缺席时据此分流表达。
  const isViewProducer = dump.root.touchBoundsInRoot == null;
  const violations: Violation[] = [];
  const advisories: InvariantAdvisory[] = [];
  let executed = 0;

  // raw(原始 SemNode)与 SemDp 结构同构(toDp 逐子 map,顺序 1:1),沿递归携带以辨"显式 null"与"字段缺省(omit)"
  // ——toDp 已把二者都归一为 touchBoundsDp 缺席,单看 SemDp 无法区分。
  const visit = (n: SemDp, raw: SemNode, isRoot: boolean): void => {
    // 1. childClipped:非根 + 有 clipped boundsDp;unclipped(positionDp+sizeDp)与 clipped 四边任一差 >CLIP_TOL_DP。
    if (!isRoot && n.boundsDp !== undefined) {
      executed += 1;
      const u = box(n);
      const c = n.boundsDp;
      const clipped = Math.abs(u.left - c.left) > CLIP_TOL_DP || Math.abs(u.top - c.top) > CLIP_TOL_DP
        || Math.abs(u.right - c.right) > CLIP_TOL_DP || Math.abs(u.bottom - c.bottom) > CLIP_TOL_DP;
      if (clipped) {
        violations.push(mkViolation(n, 'childClipped',
          `(${u.left},${u.top},${u.right},${u.bottom})dp`, `(${c.left},${c.top},${c.right},${c.bottom})dp`));
      }
    }
    // 2. touchTargetTooSmall:clickable,读 touchBoundsDp(CS3:必须读触控盒,layout 几何会误杀外扩小图标)。
    //    有值→门照常承重;显式 null→按 producer 判据分流(ViewDump 触控几何物理不可观测→expected_unsupported
    //    advisory,不进 violations/score/executed;SemanticsDump 触控盒 null=数据丢失→L2Error 失败,不给 advisory);
    //    字段缺省(omit,legacy TS fixture 口径)→T4.4 纯可用性跳过,不计数不 advisory。
    if (n.clickable === true) {
      if (n.touchBoundsDp !== undefined) {
        executed += 1;
        const w = n.touchBoundsDp.right - n.touchBoundsDp.left;
        const h = n.touchBoundsDp.bottom - n.touchBoundsDp.top;
        if (w < TOUCH_TARGET_MIN_DP || h < TOUCH_TARGET_MIN_DP) {
          violations.push(mkViolation(n, 'touchTargetTooSmall', `>=${TOUCH_TARGET_MIN_DP}x${TOUCH_TARGET_MIN_DP}dp`, `${w}x${h}dp`));
        }
      } else if (raw.touchBoundsInRoot === null) {
        if (isViewProducer) {
          advisories.push({ property: 'touchTargetTooSmall', testTag: n.testTag, reason: 'expected_unsupported' });
        } else {
          throw new L2Error('semantics_export_failed');
        }
      }
    }
    // 3. missingContentDescription:clickable + cd 空 + 自身子树无可见文本(兄弟文本不豁免,收窄口径②)。
    if (n.clickable === true) {
      executed += 1;
      const hasCd = typeof n.contentDescription === 'string' && n.contentDescription !== '';
      if (!hasCd && !hasTextInSubtree(n)) {
        violations.push(mkViolation(n, 'missingContentDescription', 'non-empty contentDescription or descendant text', 'null'));
      }
    }
    // 4. textOverflow:hasVisualOverflow 非空即执行;true 时 NATIVE→violation(hard-gate),否则→advisory(环境未钉住)。
    if (n.hasVisualOverflow !== undefined && n.hasVisualOverflow !== null) {
      executed += 1;
      if (n.hasVisualOverflow === true) {
        if (nativeMode) {
          violations.push(mkViolation(n, 'textOverflow', 'no visual overflow', 'clipped/ellipsized'));
        } else {
          advisories.push({ property: 'textOverflow', testTag: n.testTag, reason: 'native_graphics_unverified' });
        }
      }
    }
    // 5. siblingOverlap:父访问时按子序枚举 C(k,2) 对;交叠宽高均 >OVERLAP_MIN_DP 才判(同对仅报一次)。
    const kids = n.children;
    const rawKids = raw.children;   // 与 kids 顺序 1:1(toDp 逐子 map),供递归携带原始节点。
    for (let i = 0; i < kids.length; i += 1) {
      for (let j = i + 1; j < kids.length; j += 1) {
        executed += 1;
        const a = box(kids[i]!);
        const b = box(kids[j]!);
        const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ow > OVERLAP_MIN_DP && oh > OVERLAP_MIN_DP) {
          violations.push(mkViolation(kids[i]!, 'siblingOverlap', 'no overlap', `overlaps ${label(kids[j]!)} by ${ow}x${oh}dp`));
        }
      }
    }
    for (let i = 0; i < kids.length; i += 1) visit(kids[i]!, rawKids[i]!, false);
  };
  visit(root, dump.root, true);
  return { violations, executed, advisories };
}
