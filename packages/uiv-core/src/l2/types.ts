/**
 * L2 结构裁判核心类型(T1.3 Step 1)。
 * 坐标口径:FigmaNode.absoluteBoundingBox 为绝对画布坐标(runL2 内 rebase 减根原点);
 * SemNode 全部为 px(÷density 转 dp 得 SemDp);fontSizeSp 不换算。
 */
export interface Box { x: number; y: number; width: number; height: number }

export interface FigmaNode {
  id: string; name: string; type: string; visible?: boolean;
  absoluteBoundingBox: Box | null;
  paddingLeft?: number; paddingTop?: number; paddingRight?: number; paddingBottom?: number;
  itemSpacing?: number; cornerRadius?: number;
  fills?: { type: string; color?: { r: number; g: number; b: number; a: number } }[];
  style?: { fontSize?: number }; characters?: string; children?: FigmaNode[];
}

/** 语义树导出节点(全部 px)。T3.4 可选字段:存量 TS fixture 免改,demo Rule 侧恒导出。 */
export interface SemNode {
  testTag: string | null; text: string | null;
  positionInRoot: { x: number; y: number }; size: { width: number; height: number };
  touchBoundsInRoot: { left: number; top: number; right: number; bottom: number };
  colorHex: string | null; fontSizeSp: number | null; cornerRadiusPx: number | null;
  boundsInRoot?: { left: number; top: number; right: number; bottom: number }; // px, clipped;与 unclipped positionInRoot+size 作差判被裁(childClipped)
  hasVisualOverflow?: boolean | null;   // 文本可视溢出(ellipsis);非文本节点为 null
  clickable?: boolean;                   // semantics config 含 OnClick(CS3 触控口径)
  contentDescription?: string | null;    // merged 可及名(missingContentDescription 判据)
  children: SemNode[];
}

export interface SemanticsDump { density: number; root: SemNode; graphicsMode?: string }

/** join 时 px→dp 换算后的语义节点(fontSizeSp/colorHex 不换算)。 */
export interface SemDp {
  testTag: string | null; text: string | null;
  positionDp: { x: number; y: number }; sizeDp: { width: number; height: number };
  touchBoundsDp: { left: number; top: number; right: number; bottom: number };
  colorHex: string | null; fontSizeSp: number | null; cornerRadiusDp: number | null;
  boundsDp?: { left: number; top: number; right: number; bottom: number }; // ÷density
  hasVisualOverflow?: boolean | null;
  clickable?: boolean;
  contentDescription?: string | null;
  children: SemDp[];
}

/** testTag join 成对结果:Figma 节点(rebase 后)↔ 语义节点(dp)。 */
export interface Pair { figma: FigmaNode; sem: SemDp }

export type Severity = 'blocking' | 'high' | 'medium' | 'low';

export interface Violation {
  judgePath: 'parity' | 'parity-pixel-sampled' | 'invariant'; testTag: string; figmaName: string;
  property: string; expected: string; actual: string; severity: Severity; hint: string;
}

/** T2.7 像素通道跳过记录。 */
export interface PixelDiagnostic {
  code: 'pixel_sample_skipped_nonsolid' | 'pixel_sample_skipped_container' | 'pixel_sample_empty_region';
  testTag: string; detail: string;
}

/** report.json 顶层 reason=inconclusive 时的细分(设计文档 2.4 节/步骤 5)。 */
export type SubReason =
  | 'tag_coverage_low' | 'matching_rate_low'
  | 'semantics_export_failed' | 'render_harness_error'
  | 'figma_spec_invalid' | 'native_graphics_unverified' | 'fixture_unavailable';

/** 语义导出/挽具类不可判定错误(join 遇 density≠2.0 抛出)。 */
export class L2Error extends Error {
  constructor(public readonly subReason: SubReason) { super(subReason); }
}

/** 防震荡持久化(.ui-verify/state.json;设计原则 2 分层比较)。 */
export interface StateFile {
  round: number; stagnation: number; regression: boolean;
  regressionReason: string | null;
  history: { round: number; blockingHits: number; score: number }[];
}
