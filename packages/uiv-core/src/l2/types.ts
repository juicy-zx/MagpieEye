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
  /** Codex B1:auto-layout 轴向(runL2 自 spec 透传);undefined 时 itemSpacing 派生断言保守跳过,不得默认 VERTICAL。 */
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
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
  source?: string | null;   // T3.3:verify-page 层由 enrichViolations 富化(demoDir 相对 "path:line");l2 引擎不产
}

/**
 * assertPair informational 跳过记录(落 structural.diagnostics.pixel,不进 violations、不计 executed、不影响 score/pass):
 * pixel_sample_* = T2.7 像素通道跳过三态;
 * l2_derived_geometry_skipped = Codex D2 派生几何门跳过(携结构化字段)。
 */
export interface PixelDiagnostic {
  code: 'pixel_sample_skipped_nonsolid' | 'pixel_sample_skipped_container' | 'pixel_sample_empty_region'
    | 'l2_derived_geometry_skipped';
  testTag: string; detail: string;
  /** 以下字段仅 l2_derived_geometry_skipped 携带(D2:nodeId + 原因 + 跳过规则 + 两侧直接子节点数)。 */
  nodeId?: string;
  /** design_derivation_mismatch = R1-① 设计侧可推导性门:authored 值无法由 Figma 直接子 bbox 重建(与身份双射失败区分)。 */
  reason?: 'direct_child_correspondence_unproven' | 'design_derivation_mismatch' | 'layout_mode_missing' | 'unsupported_layout';
  /** correspondence 门整族跳过用粗粒度 'padding';R1-① 设计侧门按规则粒度记具体 padding 键。 */
  rules?: Array<'padding' | 'itemSpacing' | 'paddingLeft' | 'paddingTop' | 'paddingRight' | 'paddingBottom'>;
  semChildCount?: number; figChildCount?: number;
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
