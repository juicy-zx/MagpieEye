/**
 * uiv check L2 编排(T1.3 Step 12)。在 T1.2 v0 管线基础上追加:
 * gradle 跑完 → 读 semantics.json + spec.json → specToFigma 适配 → runL2 →
 * 读写 .ui-verify/state.json(stepState 防震荡)→ 合并为 report.json v1(reports/<nodeDir>/)。
 * 产物目录口径:semantics.json 复制到 renders/<nodeDir>/;report.json/diff 归 reports/<nodeDir>/。
 * core 全测;CLI 层薄壳只接线。
 */
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { atomicCopyFileSync, atomicWriteFileSync } from '../util/atomic.js';
import { baselineDirName } from '../baseline/pull.js';
import { FigmaSpecInvalidError } from '../figma/types.js';
import type { Spec, SpecNode } from '../figma/types.js';
import { runL2 } from '../l2/report.js';
import { stepState } from '../l2/stability.js';
import type { FigmaNode, SemanticsDump, StateFile, SubReason } from '../l2/types.js';
import { validateReportV1 } from '../report/v1.js';
import type { Lane, ReportV1 } from '../report/v1.js';
import { runCheck } from './run.js';
import type { CheckOpts, GradleRunner } from './run.js';

/** hex → 归一化 RGB;a 携 paint opacity(Codex D4:spec v0 无 node opacity,effective alpha = paint opacity)。 */
function hexToRgb(hex: string, alpha: number): { r: number; g: number; b: number; a: number } {
  const int = Number.parseInt(hex.replace('#', ''), 16);
  return { r: ((int >> 16) & 0xff) / 255, g: ((int >> 8) & 0xff) / 255, b: (int & 0xff) / 255, a: alpha };
}

/** 归一化 spec.json 的 SpecNode(bbox 已 re-base)→ L2 FigmaNode。padding/itemSpacing/layoutMode 仅 auto-layout 携带。 */
export function specNodeToFigma(n: SpecNode): FigmaNode {
  const out: FigmaNode = {
    id: n.id, name: n.name, type: n.type, visible: n.visible,
    absoluteBoundingBox: n.bbox === null ? null : { x: n.bbox.x, y: n.bbox.y, width: n.bbox.w, height: n.bbox.h },
  };
  if (n.layoutMode !== 'NONE') {
    out.layoutMode = n.layoutMode;   // Codex B1:透传轴向供 itemSpacing 派生断言;NONE 门(下方字段不携带)行为不变
    // B3:主轴对齐门内透传(SPACE_BETWEEN 时 assert 跳 itemSpacing);spec 缺字段不合成 own-property
    if (n.primaryAxisAlignItems !== undefined) out.primaryAxisAlignItems = n.primaryAxisAlignItems;
    out.paddingLeft = n.padding.l; out.paddingTop = n.padding.t;
    out.paddingRight = n.padding.r; out.paddingBottom = n.padding.b;
    out.itemSpacing = n.itemSpacing;
  }
  if (n.cornerRadii !== null) out.cornerRadius = n.cornerRadii[0];
  const fills = n.fills.map((f) => (f.hex === null ? { type: f.type } : { type: f.type, color: hexToRgb(f.hex, f.opacity) }));
  if (fills.length > 0) out.fills = fills;
  if (n.text !== null) { out.style = { fontSize: n.text.fontSize }; out.characters = n.text.characters; }
  if (n.children.length > 0) out.children = n.children.map(specNodeToFigma);
  return out;
}

function readSpecRoot(uiVerifyDir: string, nodeDir: string): FigmaNode {
  const specPath = join(uiVerifyDir, 'baselines', nodeDir, 'spec.json');
  if (!existsSync(specPath)) throw new FigmaSpecInvalidError(`spec.json not found: ${specPath}`);
  const spec = JSON.parse(readFileSync(specPath, 'utf8')) as Spec;
  if (spec.root === undefined) throw new FigmaSpecInvalidError('spec.json missing root');
  return specNodeToFigma(spec.root);
}

function readSemanticsDump(path: string): SemanticsDump {
  const dump = JSON.parse(readFileSync(path, 'utf8')) as SemanticsDump;
  if (typeof dump.density !== 'number' || dump.root === undefined) {
    throw new Error('semantics.json malformed');
  }
  return dump;
}

function readState(statePath: string): StateFile | null {
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, 'utf8')) as StateFile;
}

export interface RunCheckL2Opts extends CheckOpts {
  minScore?: number; blockingSeverities?: readonly string[]; untaggedCoverageThreshold?: number;
  /** T3.4:L2-invariant 免基准套件开关,同名透传 runL2(默认 true;--state 编排归 T3.3)。 */
  invariant?: boolean;
  /** T2.8:渲染来源车道标注,写入 report.lane(缺省 slow)。 */
  lane?: Lane;
  /** T2.8 快车道:worker 已产出的渲染产物;设置则跳过 gradle,PNG+语义树喂现有 L1/L2 管线。 */
  preRendered?: { renderedPng: string; semanticsPath: string };
  /** T3.3:不读写 state.json(逐格页验证不参与防震荡),prevState 恒 null、regression 恒 false。 */
  disableState?: boolean;
  /** T3.3:semantics.json mtime 早于此值 → semantics_export_failed(防上一格陈旧 dump 复用)。 */
  semanticsMinMtimeMs?: number;
  /** T3.3:排除属性(geometry-only 排除 color)透传 runL2→assertPair:命中属性不产 violation、不计 executed。 */
  excludeProperties?: readonly string[];
}

export async function runCheckL2(
  runner: GradleRunner, opts: RunCheckL2Opts,
): Promise<{ report: ReportV1; reportPath: string; statePath: string }> {
  // 快车道:worker PNG 经 preRenderedPng 短路 gradle,复用 runCheck 的 copy+L1+成功判定主链。
  const v0 = await runCheck(runner, opts.preRendered ? { ...opts, preRenderedPng: opts.preRendered.renderedPng } : opts);
  const nodeDir = baselineDirName(opts.nodeId, opts.version);
  // T3.3:逐格产物隔离——renders/reports 追加 cells/<sub>;baselines 恒 <nodeDir>。
  const cellSeg = opts.artifactSubdir !== undefined ? ['cells', opts.artifactSubdir] : [];
  const reportsDir = join(opts.uiVerifyDir, 'reports', nodeDir, ...cellSeg);
  mkdirSync(reportsDir, { recursive: true });
  const reportPath = join(reportsDir, 'report.json');
  const statePath = join(opts.uiVerifyDir, 'state.json');

  const write = (r: ReportV1): { report: ReportV1; reportPath: string; statePath: string } => {
    r.lane = opts.lane ?? 'slow';   // T2.8:单一出口盖章车道来源
    const validated = validateReportV1(r);
    atomicWriteFileSync(reportPath, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
    return { report: validated, reportPath, statePath };
  };

  const base: ReportV1 = {
    schemaVersion: 1, pass: false, reason: v0.report.reason,
    subReason: v0.report.subReason as SubReason | null, compileError: v0.report.compileError,
    pixel: v0.report.pixel, structural: null, artifacts: v0.report.artifacts,
    score: 0, regression: false, regressionReason: null,
  };

  // 管线失败(编译/挽具/无 PNG):v1 携 v0 字段,不进 L2。
  if (!v0.report.pass) return write(base);

  // semantics.json 来源:慢车道 = SemanticsDumpRule 落 demo build/uiv/<shortName>.semantics.json;
  // 快车道 = worker 导出的同格式语义树(opts.preRendered.semanticsPath)。
  const shortName = (opts.testFqn.split('.').at(-1) ?? '').replace(/ScreenshotTest$/, '').replace(/Test$/, '');
  const semSrc = opts.preRendered?.semanticsPath ?? join(opts.demoDir, 'app', 'build', 'uiv', `${shortName}.semantics.json`);
  // T3.3:mtime 门——semantics.json 早于本格 gradle 启动即判陈旧 dump 复用(防上一格残留冒充本格)。
  if (!existsSync(semSrc)
    || (opts.semanticsMinMtimeMs !== undefined && statSync(semSrc).mtimeMs < opts.semanticsMinMtimeMs)) {
    return write({ ...base, reason: 'inconclusive', subReason: 'semantics_export_failed' });
  }
  const renderDir = join(opts.uiVerifyDir, 'renders', nodeDir, ...cellSeg);
  mkdirSync(renderDir, { recursive: true });
  atomicCopyFileSync(semSrc, join(renderDir, 'semantics.json'));

  let figmaRoot: FigmaNode;
  let dump: SemanticsDump;
  try {
    figmaRoot = readSpecRoot(opts.uiVerifyDir, nodeDir);
    dump = readSemanticsDump(semSrc);
  } catch (e) {
    const subReason: SubReason = e instanceof FigmaSpecInvalidError ? 'figma_spec_invalid' : 'semantics_export_failed';
    return write({ ...base, reason: 'inconclusive', subReason });
  }

  const prevState = opts.disableState === true ? null : readState(statePath);   // T3.3:disableState 不读 state
  const l2Opts: Parameters<typeof runL2>[2] = { prevState };
  if (opts.minScore !== undefined) l2Opts.minScore = opts.minScore;
  if (opts.blockingSeverities !== undefined) l2Opts.blockingSeverities = opts.blockingSeverities;
  if (opts.untaggedCoverageThreshold !== undefined) l2Opts.untaggedCoverageThreshold = opts.untaggedCoverageThreshold;
  if (opts.invariant !== undefined) l2Opts.invariant = opts.invariant;
  if (opts.excludeProperties !== undefined) l2Opts.excludeProperties = opts.excludeProperties;
  // T2.7:同轮渲染的 rendered.png 喂像素通道;不可读则跳过
  const renderPath = v0.report.artifacts.render;
  if (renderPath !== null) {
    try {
      const png = PNG.sync.read(readFileSync(renderPath));
      l2Opts.pixelSource = { png };
    } catch { /* 像素通道跳过 */ }
  }
  const l2 = runL2(figmaRoot, dump, l2Opts);

  // persist state.json(与 runL2 内部同参 stepState,结果一致)。T3.3:disableState 时跳过(逐格不参与防震荡)。
  if (opts.disableState !== true) {
    const blockingSeverities = opts.blockingSeverities ?? ['blocking', 'high'];
    const blockingHits = (l2.structural?.violations ?? []).filter((v) => blockingSeverities.includes(v.severity)).length;
    const state = stepState(prevState, { blockingHits, score: l2.score, pass: l2.pass });
    atomicWriteFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  }

  return write({ ...l2, compileError: null, pixel: v0.report.pixel, artifacts: v0.report.artifacts });
}
