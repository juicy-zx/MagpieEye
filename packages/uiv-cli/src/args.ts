/**
 * uiv CLI argv 解析(T1.2 Step 9,手写,不引 commander)。
 * 纯函数,零依赖,单测覆盖;IO/接线在 index.ts。
 */
export class CliUsageError extends Error {}

export interface CliIgnoreRegion { x: number; y: number; w: number; h: number }

export interface BaselinePullCmd { kind: 'baseline-pull'; fixture: string; file: string; node: string }
export interface CheckCmd { kind: 'check'; preview: string; node: string; demo: string; ignoreRegion: CliIgnoreRegion | null }
export type ParsedCommand = BaselinePullCmd | CheckCmd;

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
    const flags = collectFlags(rest.slice(1), ['--fixture', '--file', '--node']);
    // T1.2 仅 fixture 模式;REST 通道待 B1 PAT
    return {
      kind: 'baseline-pull',
      fixture: required(flags, '--fixture'),
      file: required(flags, '--file'),
      node: required(flags, '--node'),
    };
  }
  if (cmd === 'check') {
    const flags = collectFlags(rest, ['--preview', '--node', '--demo', '--ignore-region']);
    const rawRegion = flags.get('--ignore-region');
    return {
      kind: 'check',
      preview: required(flags, '--preview'),
      node: required(flags, '--node'),
      demo: required(flags, '--demo'),
      ignoreRegion: rawRegion === undefined ? null : parseIgnoreRegion(rawRegion),
    };
  }
  throw new CliUsageError(`unknown command: ${[cmd, rest[0]].filter(Boolean).join(' ') || '(none)'} (available: baseline pull, check)`);
}
