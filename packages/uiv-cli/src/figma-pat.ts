/**
 * 项目本地 `.figma-pat` 文件支持(补 process.env.FIGMA_PAT 之外的第二条 PAT 配置路径)。
 * 优先级:process.env.FIGMA_PAT 非空 → 直接返回,不读文件、不做任何检查。
 * 否则读 <cwd>/.figma-pat:不存在 → 空串(交由既有 usage error 处理)。
 * 防提交提醒(不阻断):文件位于 git 仓库内且未被 .gitignore 忽略 → console.error 警告(路径 + 泄露风险 +
 * 修复指引),但仍照常返回内容;git 不可用/不在仓库内 → 不告警(无提交风险)。权限过宽(组/他人可读写)同为
 * 不阻断的独立告警,二者可同时出现。读到的 PAT 只在进程内以返回值传递,绝不写回 process.env
 * (不得破坏 gradle-runner 的 env 剔除设计)。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

type GitIgnoreStatus = 'ignored' | 'not-ignored' | 'no-git';

/** `git check-ignore -q <绝对路径>`:退出码 0=已忽略,1=在仓库内但未忽略,其余(128/spawn 失败等)=非 git 场景。 */
function checkGitIgnoreStatus(absPath: string, cwd: string): GitIgnoreStatus {
  try {
    execFileSync('git', ['check-ignore', '-q', absPath], { cwd, stdio: 'ignore' });
    return 'ignored';
  } catch (e) {
    if ((e as { status?: number | null }).status === 1) return 'not-ignored';
    return 'no-git';   // 128(非 git 仓库)/ ENOENT(git 不可用)等,不告警(无提交风险)
  }
}

export function resolveFigmaPat(cwd: string): string {
  const envPat = process.env.FIGMA_PAT;
  if (envPat) return envPat;   // env 优先:非空即返回,不读文件、不做任何检查

  const patPath = path.join(cwd, '.figma-pat');
  if (!existsSync(patPath)) return '';

  if (checkGitIgnoreStatus(patPath, cwd) === 'not-ignored') {
    console.error(`uiv: WARN ${patPath} 未被 .gitignore 忽略,存在被提交泄露的风险;请在对应 .gitignore 中追加一行 \`.figma-pat\`。`);
  }

  const mode = statSync(patPath).mode;
  if ((mode & 0o077) !== 0) {
    console.error(`uiv: WARN ${patPath} 权限过宽(组/他人可读写),建议 chmod 600`);
  }

  return readFileSync(patPath, 'utf8').trim();
}
