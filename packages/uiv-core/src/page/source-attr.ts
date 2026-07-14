/**
 * T3.3:source 行号归因(口径⑦)。violation.testTag(如 fig:1:101)作字面量在
 * <moduleDir>/src/main 下 .kt(路径字典序)纯文本检索首个含 "<testTag>"(带双引号)的行,
 * 产 "<demoDir 相对路径>:<行号>";无命中 → null。l2 引擎不改,在 verify-page 层富化。
 * P0-8 批次②:检索根参数化(moduleDir),缺省 <demoDir>/app 保持既有输出格式(相对 demoDir,保 app/ 前缀)。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { resolveModuleDir } from '../util/module.js';
import type { Violation } from '../l2/types.js';

/** 递归收集 <moduleDir>/src/main 下所有 .kt 的绝对路径,按字典序(相对序一致,同前缀)。 */
function collectKtFiles(moduleDir: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.kt')) out.push(p);
    }
  };
  walk(join(moduleDir, 'src', 'main'));
  return out.sort();
}

/** moduleDir 缺省 = <demoDir>/app;返回路径恒相对 demoDir(工程根),保持 app/ 前缀不变。 */
export function attributeSource(testTag: string, demoDir: string, moduleDir?: string): string | null {
  const modDir = resolveModuleDir(demoDir, moduleDir);
  const needle = `"${testTag}"`;   // 带双引号:tag 含 ':' 不误伤,纯文本 includes(非正则)
  for (const file of collectKtFiles(modDir)) {
    let lines: string[];
    try { lines = readFileSync(file, 'utf8').split('\n'); } catch { continue; }
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i]!.includes(needle)) {
        return `${relative(demoDir, file).split(sep).join('/')}:${i + 1}`;
      }
    }
  }
  return null;
}

/** 逐条富化 violation.source(已有值不覆写);同 testTag 复用一次检索。 */
export function enrichViolations(violations: Violation[], demoDir: string, moduleDir?: string): Violation[] {
  const cache = new Map<string, string | null>();
  for (const v of violations) {
    if (v.source !== undefined) continue;   // 已有值(含 null)不覆写
    if (!cache.has(v.testTag)) cache.set(v.testTag, attributeSource(v.testTag, demoDir, moduleDir));
    v.source = cache.get(v.testTag) ?? null;
  }
  return violations;
}
