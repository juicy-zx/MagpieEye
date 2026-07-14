/**
 * P0-8 批次②:uiv preflight 状态机 + environment.preflight envelope(顺应工程配置,静态解析)。
 * codex Phase 1 决断 B(严格遵守):
 *   - 声明落实测基线外 → 警告 W_DECLARED_STACK_UNVERIFIED、exit 0、标"未验证"不显示"兼容"
 *     (静态声明只是发现信号,非兼容性证明)。
 *   - 硬前置 exit≠0 + error.code:minSdk<26 / 非 application 模块 / 所选模块目录无法定位 /
 *     minSdk 或 application 身份无法静态确认("硬前置无法确认"失败,不伪装通过)。
 *   - Kotlin/KGP 显示 unknown;composeCompilerPlugin 单独报。
 * 完整实测基线常量(codex 第 1 组实测):Gradle 9.5.1 / JDK Corretto21(Java17 字节码)/ macOS arm64 /
 *   compileSdk36 / minSdk26 / AGP9.0.1 / Robolectric4.16 / Compose BOM2026.06.00 / composeCompilerPlugin2.2.10。
 */
import { detectStack } from './detect.js';
import type { DetectedStack, ModuleType, SdkValue } from './detect.js';

/** 完整实测基线。JDK(Corretto21/Java17)与 OS(macOS arm64)非工程声明文件可静态解析,故不入 checks,仅留档。 */
export const PREFLIGHT_BASELINE = {
  gradle: '9.5.1',
  agp: '9.0.1',
  composeBom: '2026.06.00',
  robolectric: '4.16',
  roborazzi: '1.63.0',
  composeCompilerPlugin: '2.2.10',
  compileSdk: '36',
  minSdk: 26,
} as const;

/** 硬前置无法满足 → exit≠0(与 CliUsageError=2/record=3/workspace=75 区分,用 1)。 */
export const EXIT_PREFLIGHT_UNSUPPORTED = 1;

export const PREFLIGHT_ERROR = {
  MODULE_DIR_NOT_FOUND: 'E_MODULE_DIR_NOT_FOUND',
  MIN_SDK_BELOW_MIN: 'E_MIN_SDK_BELOW_MIN',
  MIN_SDK_UNCONFIRMED: 'E_MIN_SDK_UNCONFIRMED',
  NON_APPLICATION_MODULE: 'E_NON_APPLICATION_MODULE',
  APPLICATION_IDENTITY_UNCONFIRMED: 'E_APPLICATION_IDENTITY_UNCONFIRMED',
} as const;

export const W_DECLARED_STACK_UNVERIFIED = 'W_DECLARED_STACK_UNVERIFIED';

/** 参与"声明失配"警告判定的软轴(minSdk/moduleType 是硬门,不在此列)。 */
const SOFT_AXIS_IDS = ['gradle', 'agp', 'composeBom', 'robolectric', 'roborazzi', 'composeCompilerPlugin', 'compileSdk'];

export interface PreflightCheck { id: string; expected: string; actual: string; ok: boolean }
export interface PreflightWarning { code: string; message: string }
export interface PreflightError { code: string; message: string; retryable: boolean }
export interface PreflightResult {
  supported: boolean;
  /** codex 决断:Kotlin/KGP 恒 unknown(不由 composeCompilerPlugin 代理)。 */
  kotlin: 'unknown';
  checks: PreflightCheck[];
  warnings: PreflightWarning[];
}
export interface PreflightEnvelope {
  command: 'environment.preflight';
  exitCode: number;
  error: PreflightError | null;
  pass: null;
  artifacts: [];
  result: PreflightResult;
}

function sdkActual(v: SdkValue): string {
  switch (v.kind) {
    case 'value': return String(v.value);
    case 'unconfirmed': return `unconfirmed(${v.raw})`;
    case 'absent': return 'absent';
  }
}

function moduleTypeActual(t: ModuleType): string {
  switch (t.kind) {
    case 'application': return 'application';
    case 'other': return t.pluginId;
    case 'unconfirmed': return 'unconfirmed';
  }
}

/** 软轴对比:声明值(缺失记 'unknown')== 基线即 ok。声明只是发现信号,ok 仅表"与实测基线一致",非兼容性证明。 */
function softCheck(id: string, expected: string, actual: string | null): PreflightCheck {
  const a = actual ?? 'unknown';
  return { id, expected, actual: a, ok: a === expected };
}

/** 由已探测的声明栈构建 checks + 状态机判定,返回 environment.preflight envelope。 */
export function buildPreflightEnvelope(s: DetectedStack): PreflightEnvelope {
  const B = PREFLIGHT_BASELINE;
  const checks: PreflightCheck[] = [
    softCheck('gradle', B.gradle, s.gradle),
    softCheck('agp', B.agp, s.agp),
    softCheck('composeBom', B.composeBom, s.composeBom),
    softCheck('robolectric', B.robolectric, s.robolectric),
    softCheck('roborazzi', B.roborazzi, s.roborazzi),
    softCheck('composeCompilerPlugin', B.composeCompilerPlugin, s.composeCompilerPlugin),
    softCheck('compileSdk', B.compileSdk, sdkActual(s.compileSdk)),
    { id: 'minSdk', expected: `>=${B.minSdk}`, actual: sdkActual(s.minSdk), ok: s.minSdk.kind === 'value' && s.minSdk.value >= B.minSdk },
    { id: 'moduleType', expected: 'application', actual: moduleTypeActual(s.moduleType), ok: s.moduleType.kind === 'application' },
  ];

  // 硬前置(优先级顺序;首个命中即 error,不伪装通过)。
  const E = PREFLIGHT_ERROR;
  let error: PreflightError | null = null;
  if (!s.moduleBuildFileFound) {
    error = { code: E.MODULE_DIR_NOT_FOUND, message: `selected module directory could not be located (no build.gradle[.kts] under ${s.moduleDir})`, retryable: false };
  } else if (s.minSdk.kind === 'absent' || s.minSdk.kind === 'unconfirmed') {
    error = { code: E.MIN_SDK_UNCONFIRMED, message: `minSdk cannot be statically confirmed (${sdkActual(s.minSdk)})`, retryable: false };
  } else if (s.minSdk.value < B.minSdk) {
    error = { code: E.MIN_SDK_BELOW_MIN, message: `minSdk ${s.minSdk.value} is below required ${B.minSdk}`, retryable: false };
  } else if (s.moduleType.kind === 'other') {
    error = { code: E.NON_APPLICATION_MODULE, message: `selected module is not a com.android.application (found ${s.moduleType.pluginId})`, retryable: false };
  } else if (s.moduleType.kind === 'unconfirmed') {
    error = { code: E.APPLICATION_IDENTITY_UNCONFIRMED, message: 'application module identity cannot be statically confirmed', retryable: false };
  }

  // 声明失配警告(仅硬前置全过时评估):软轴任一 != 基线 → W_DECLARED_STACK_UNVERIFIED,exit 0,标未验证。
  const warnings: PreflightWarning[] = [];
  if (error === null) {
    const mismatched = checks.filter((c) => SOFT_AXIS_IDS.includes(c.id) && !c.ok);
    if (mismatched.length > 0) {
      warnings.push({
        code: W_DECLARED_STACK_UNVERIFIED,
        message: `declared stack differs from the verified baseline; treated as UNVERIFIED (not proven compatible): ${mismatched.map((c) => `${c.id}=${c.actual} (baseline ${c.expected})`).join(', ')}`,
      });
    }
  }

  const supported = error === null && warnings.length === 0;
  const exitCode = error === null ? 0 : EXIT_PREFLIGHT_UNSUPPORTED;
  return { command: 'environment.preflight', exitCode, error, pass: null, artifacts: [], result: { supported, kotlin: 'unknown', checks, warnings } };
}

/** 静态探测目标工程声明栈 → environment.preflight envelope(共用层入口:CLI/MCP/commands 复用)。 */
export function runPreflight(
  projectRoot: string,
  opts: { projectPath?: string; moduleDir?: string } = {},
): PreflightEnvelope {
  return buildPreflightEnvelope(detectStack(projectRoot, opts));
}
