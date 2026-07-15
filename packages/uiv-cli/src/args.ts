/**
 * uiv CLI argv 解析(T1.2 Step 9,手写,不引 commander)。
 * 纯函数,零依赖,单测覆盖;IO/接线在 index.ts。
 */
export class CliUsageError extends Error {}

export interface CliIgnoreRegion { x: number; y: number; w: number; h: number }

export interface BaselinePullCmd { kind: 'baseline-pull'; fixture: string; file: string; node: string }
export interface BaselineCheckVersionCmd { kind: 'baseline-check-version'; file: string; metaFixture: string | null }
/** P0-8 批次②:demo=工程根(--demo 或 --project,后者为规范名);module=Gradle project path(默认 :app);variant 默认 debug。
 *  P0-8 双 lane:sandbox=`--sandbox` 布尔(默认 false → direct 直连;true → P0-1 冷道沙箱 opt-in)。 */
export interface CheckCmd { kind: 'check'; preview: string; node: string; demo: string; module: string; variant: string; version: string | null; ignoreRegion: CliIgnoreRegion | null; record: boolean; sandbox: boolean }
/** P0-8 批次②:环境静态预检(不跑 gradle)。demo=工程根;module=Gradle project path(默认 :app);--json 输出单个 envelope。 */
export interface PreflightCmd { kind: 'preflight'; demo: string; module: string; json: boolean }
export interface PinStateArg { name: string; judgePath: 'parity'; figmaVariantNodeId: string }
export interface PinCmd {
  kind: 'pin';
  file: string; node: string; test: string; demo: string;
  fixture: string | null; source: string | null;
  states: PinStateArg[]; minScore: number | null; matrix: string | null;
}
export interface VerifyPageCmd {
  kind: 'verify-page';
  test: string; node: string; demo: string; module: string; variant: string; session: string;
  version: string | null;   // D-02/M3 消歧：可选，给定时按 nodeId+version 唯一命中 mapping entry
  states: string[]; matrix: string; json: boolean; out: string | null;
  sandbox: boolean;   // P0-8 双 lane:--sandbox 布尔(默认 false → direct;true → 冷道沙箱 opt-in)
}
export interface ReportCmd { kind: 'report'; junit: boolean; in: string; out: string | null; suite: string | null }
export interface L3AttachCmd { kind: 'l3-attach'; report: string; verdicts: string; pack: string }
export type ParsedCommand = BaselinePullCmd | BaselineCheckVersionCmd | CheckCmd | PreflightCmd | PinCmd | VerifyPageCmd | ReportCmd | L3AttachCmd;

const PIN_MATRIX_RE = /^(l-shape|full|custom:.+)$/;

/** 把 `--flag value` 序列收进表;重复 flag 取末次;非 --flag 开头或缺值即报错。 */
function collectFlags(rest: string[], allowed: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === undefined || !flag.startsWith('--') || !allowed.includes(flag)) {
      throw new CliUsageError(`unknown or misplaced argument: ${flag ?? '(none)'}`);
    }
    if (value === undefined || value.startsWith('--')) {
      throw new CliUsageError(`flag ${flag} requires a value`);
    }
    out.set(flag, value);
  }
  return out;
}

function required(flags: Map<string, string>, flag: string): string {
  const v = flags.get(flag);
  if (v === undefined) throw new CliUsageError(`missing required flag: ${flag}`);
  return v;
}

/** P0-8 批次②:工程根 = --project(规范名)或 --demo(向后兼容别名);二者皆缺即报错。 */
function requiredProjectRoot(flags: Map<string, string>): string {
  const v = flags.get('--project') ?? flags.get('--demo');
  if (v === undefined) throw new CliUsageError('missing required flag: --project (or --demo)');
  return v;
}

/** 先剥离 repeatable `--flag value` 对(收集全部,非取末次);remaining 交 collectFlags 走成对解析。 */
function extractRepeatable(rest: string[], flag: string): { values: string[]; remaining: string[] } {
  const values: string[] = [];
  const remaining: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === flag) {
      const v = rest[i + 1];
      if (v === undefined || v.startsWith('--')) throw new CliUsageError(`flag ${flag} requires a value`);
      values.push(v);
      i += 1;   // 跳过已消费的值
    } else {
      remaining.push(rest[i]!);
    }
  }
  return { values, remaining };
}

/** `--state name=<nodeId>`:首个 '=' 切分,空 name/id 报错;恒补 judgePath:'parity'(声明有具体 Figma 变体节点的态,同 CS6 自动枚举)。 */
function parsePinState(s: string): PinStateArg {
  const idx = s.indexOf('=');
  const name = idx < 0 ? '' : s.slice(0, idx).trim();
  const figmaVariantNodeId = idx < 0 ? '' : s.slice(idx + 1).trim();
  if (!name || !figmaVariantNodeId) throw new CliUsageError(`--state expects "name=nodeId", got: ${s}`);
  return { name, judgePath: 'parity', figmaVariantNodeId };
}

/** `--ignore-region x,y,w,h` 四元组解析。 */
export function parseIgnoreRegion(s: string): CliIgnoreRegion {
  const parts = s.split(',').map((p) => Number(p.trim()));
  const [x, y, w, h] = parts;
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))
      || x === undefined || y === undefined || w === undefined || h === undefined) {
    throw new CliUsageError(`--ignore-region expects "x,y,w,h" (4 numbers), got: ${s}`);
  }
  return { x, y, w, h };
}

/**
 * --preview → gradle 测试 FQN 映射,Phase 0 写死:
 * `<pkg>.<Name>Preview` → `<pkg>.<Name>ScreenshotTest`。
 */
export function previewToTestFqn(previewFqn: string): string {
  if (!previewFqn.endsWith('Preview')) {
    throw new CliUsageError(`--preview must be a *Preview FQN, got: ${previewFqn}`);
  }
  return `${previewFqn.slice(0, -'Preview'.length)}ScreenshotTest`;
}

/** argv = process.argv.slice(2)。 */
export function parseCliArgs(argv: string[]): ParsedCommand {
  const [cmd, ...rest] = argv;
  if (cmd === 'baseline' && rest[0] === 'pull') {
    const rest1 = rest.slice(1);
    // T4.3:--check-version 是无值布尔旗标,切到设计稿漂移哨兵模式(与常规 pull 互斥,先剔除再分派)。
    if (rest1.includes('--check-version')) {
      const rest2 = rest1.filter((a) => a !== '--check-version');
      const flags = collectFlags(rest2, ['--file', '--meta-fixture']);
      return {
        kind: 'baseline-check-version',
        file: required(flags, '--file'),
        metaFixture: flags.get('--meta-fixture') ?? null,
      };
    }
    const flags = collectFlags(rest1, ['--fixture', '--file', '--node']);
    // T1.2 仅 fixture 模式;REST 通道待 B1 PAT
    return {
      kind: 'baseline-pull',
      fixture: required(flags, '--fixture'),
      file: required(flags, '--file'),
      node: required(flags, '--node'),
    };
  }
  if (cmd === 'check') {
    // --record(T2.6)/--sandbox(P0-8 双 lane)均无值布尔旗标,先剔除再走 --flag value 成对解析。
    const record = rest.includes('--record');
    const sandbox = rest.includes('--sandbox');
    const rest2 = rest.filter((a) => a !== '--record' && a !== '--sandbox');
    // P0-8 批次②:--project 等价 --demo(工程根);--module(Gradle project path,默认 :app)/--variant(默认 debug)。
    const flags = collectFlags(rest2, ['--preview', '--node', '--demo', '--project', '--module', '--variant', '--version', '--ignore-region']);
    const rawRegion = flags.get('--ignore-region');
    return {
      kind: 'check',
      preview: required(flags, '--preview'),
      node: required(flags, '--node'),
      demo: requiredProjectRoot(flags),
      module: flags.get('--module') ?? ':app',
      variant: flags.get('--variant') ?? 'debug',
      version: flags.get('--version') ?? null,
      ignoreRegion: rawRegion === undefined ? null : parseIgnoreRegion(rawRegion),
      record,
      sandbox,
    };
  }
  if (cmd === 'preflight') {
    // P0-8 批次②:环境静态预检。--json 无值布尔旗标(先剔除);--project/--demo 择一必填;--module 默认 :app。
    const json = rest.includes('--json');
    const rest2 = rest.filter((a) => a !== '--json');
    const flags = collectFlags(rest2, ['--demo', '--project', '--module']);
    return {
      kind: 'preflight',
      demo: requiredProjectRoot(flags),
      module: flags.get('--module') ?? ':app',
      json,
    };
  }
  if (cmd === 'pin') {
    // --state 可重复(取全部);先剥离再走成对解析。--file/--node/--test/--demo 必填;fixture/source/min-score/matrix 可选。
    const { values: stateValues, remaining } = extractRepeatable(rest, '--state');
    const flags = collectFlags(remaining, ['--file', '--node', '--test', '--demo', '--fixture', '--source', '--min-score', '--matrix']);
    const minScoreRaw = flags.get('--min-score');
    const matrixRaw = flags.get('--matrix');
    let minScore: number | null = null;
    if (minScoreRaw !== undefined) {
      const n = Number(minScoreRaw);
      if (!Number.isFinite(n) || n <= 0 || n > 1) throw new CliUsageError(`--min-score expects a number in (0,1], got: ${minScoreRaw}`);
      minScore = n;
    }
    if (matrixRaw !== undefined && !PIN_MATRIX_RE.test(matrixRaw)) {
      throw new CliUsageError(`--matrix expects l-shape|full|custom:<name>, got: ${matrixRaw}`);
    }
    return {
      kind: 'pin',
      file: required(flags, '--file'),
      node: required(flags, '--node'),
      test: required(flags, '--test'),
      demo: required(flags, '--demo'),
      fixture: flags.get('--fixture') ?? null,
      source: flags.get('--source') ?? null,
      states: stateValues.map(parsePinState),
      minScore,
      matrix: matrixRaw ?? null,
    };
  }
  if (cmd === 'verify-page') {
    // --json/--sandbox 均无值布尔旗标(同 --record 剔除法),其余成对解析。--test/--node/--demo/--session 必填。
    const json = rest.includes('--json');
    const sandbox = rest.includes('--sandbox');
    const rest2 = rest.filter((a) => a !== '--json' && a !== '--sandbox');
    // P0-8 批次②:--project 等价 --demo;--module(默认 :app)/--variant(默认 debug)。
    const flags = collectFlags(rest2, ['--test', '--node', '--demo', '--project', '--module', '--variant', '--session', '--version', '--states', '--matrix', '--out']);
    const statesRaw = flags.get('--states');
    return {
      kind: 'verify-page',
      test: required(flags, '--test'),
      node: required(flags, '--node'),
      demo: requiredProjectRoot(flags),
      module: flags.get('--module') ?? ':app',
      variant: flags.get('--variant') ?? 'debug',
      session: required(flags, '--session'),
      version: flags.get('--version') ?? null,
      states: statesRaw === undefined ? [] : statesRaw.split(',').map((s) => s.trim()).filter(Boolean),
      matrix: flags.get('--matrix') ?? 'l-shape',
      json,
      out: flags.get('--out') ?? null,
      sandbox,
    };
  }
  if (cmd === 'report') {
    // T4.3:--junit 是无值布尔旗标,现阶段唯一支持的输出格式,故显式必填(为未来非 junit 格式预留旗标位;§4 明确不做)。
    const junit = rest.includes('--junit');
    const rest2 = rest.filter((a) => a !== '--junit');
    const flags = collectFlags(rest2, ['--in', '--out', '--suite']);
    if (!junit) throw new CliUsageError('report requires --junit (only junit output supported currently)');
    return {
      kind: 'report',
      junit: true,
      in: required(flags, '--in'),
      out: flags.get('--out') ?? null,
      suite: flags.get('--suite') ?? null,
    };
  }
  if (cmd === 'l3-attach') {
    // T4.2 轻量形态回填通道:page-report + verdicts.json + l3-input.json,三必选(缺任一 → CliUsageError=exit 2)。
    const flags = collectFlags(rest, ['--report', '--verdicts', '--pack']);
    return {
      kind: 'l3-attach',
      report: required(flags, '--report'),
      verdicts: required(flags, '--verdicts'),
      pack: required(flags, '--pack'),
    };
  }
  throw new CliUsageError(`unknown command: ${[cmd, rest[0]].filter(Boolean).join(' ') || '(none)'} (available: baseline pull, check, preflight, pin, verify-page, report, l3-attach)`);
}
