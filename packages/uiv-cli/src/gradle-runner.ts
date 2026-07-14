/**
 * T2.1:uiv 双车道 gradle runner。
 * 冷路径 = SpawnGradleRunner,经 macOS Seatbelt(sandbox-exec)关进沙箱(P0-1);
 * 热路径 = UdsGradleRunner 薄 UDS 客户端(P0-1 alpha 已代码级硬禁用,daemon 不可达,留待 P1)。
 * selectGradleRunner 恒返回冷道(见函数注释);UdsGradleRunner/renderPreviewViaDaemon 保留供 P1 复活。
 */
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { GradleRunner } from '@magpie-eye/uiv-core';
import { buildColdPathProfile } from './sandbox-profile.js';
import type { ColdPathProfileOpts } from './sandbox-profile.js';

/** 固定路径,绝不查 PATH(冷路径沙箱强制约束:防 PATH 劫持绕过沙箱)。 */
const SANDBOX_EXEC = '/usr/bin/sandbox-exec';

/** 冷路径沙箱 fail-closed 错误:平台不支持 / sandbox-exec 不可用 等,一律抛此错,绝不回退裸 gradle。 */
export class SandboxError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

/**
 * 探测 gradle 实际所用 JDK Home(其若在 $HOME 下会被沙箱 Home 读闸拦截,必须精确放行)。
 * 优先级与 gradlew/JVM 真实解析一致:
 *   ① demoDir/gradle.properties 的 org.gradle.java.home(显式钉死时最高优先)
 *   ② 环境变量 JAVA_HOME
 *   ③ /usr/libexec/java_home —— 即 /usr/bin/java stub 内部真源(本机 JAVA_HOME 空时的落点)
 */
function detectJavaHome(demoDir: string): string {
  const gp = path.join(demoDir, 'gradle.properties');
  if (existsSync(gp)) {
    const m = readFileSync(gp, 'utf8').match(/^[ \t]*org\.gradle\.java\.home[ \t]*=[ \t]*(.+?)[ \t]*$/m);
    const v = m?.[1];
    if (v) return v;
  }
  const envJavaHome = process.env.JAVA_HOME;
  if (envJavaHome) return envJavaHome;
  return execFileSync('/usr/libexec/java_home', [], { encoding: 'utf8' }).trim();
}

/** 探测 Android SDK(其若在 $HOME 下会被 Home 读闸拦截):demoDir/local.properties 的 sdk.dir,
 *  缺则环境 ANDROID_HOME/ANDROID_SDK_ROOT;全缺 → undefined(不放行)。 */
function detectAndroidSdk(demoDir: string): string | undefined {
  const lp = path.join(demoDir, 'local.properties');
  if (existsSync(lp)) {
    const m = readFileSync(lp, 'utf8').match(/^[ \t]*sdk\.dir[ \t]*=[ \t]*(.+?)[ \t]*$/m);
    const v = m?.[1];
    if (v) return v.replace(/\\:/g, ':').replace(/\\\\/g, '\\');   // Java properties 反斜杠转义反解
  }
  return process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
}

/** Maven 本地库(~/.m2/repository)—— Robolectric 从此读 android-all-instrumented + native runtime,
 *  blanket Home 读闸会挡其内容致原生运行时 NPE,故需放行。不存在 → undefined。
 *  【P0-1 对 codex 定稿 allow-list 的必要补全,待确认;见 sandbox-profile.ts 文件头】 */
function detectMavenRepo(): string | undefined {
  const repo = path.join(os.homedir(), '.m2', 'repository');
  return existsSync(repo) ? repo : undefined;
}

/**
 * 正向构造子进程 env:仅白名单键透传,精确注入 IPv4 JVM 参数;绝不从 {...process.env} 起,
 * 借此剔除 FIGMA_PAT / *_PROXY(含大小写)/ _JAVA_OPTIONS / JDK_JAVA_OPTIONS / GRADLE_OPTS
 * 等继承污染(它们本就不在白名单,故正向构造即天然排除)。
 * JAVA_TOOL_OPTIONS 精确赋值(非拼接继承)—— 令 gradle/kotlin/测试各 JVM 均绑纯 IPv4 回环。
 */
function buildColdPathEnv(cwd: string, javaHome: string): NodeJS.ProcessEnv {
  const src = process.env;
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'USER', 'LANG', 'TMPDIR']) {
    const v = src[key];
    if (v !== undefined) env[key] = v;
  }
  env.GRADLE_USER_HOME = path.join(cwd, '.gradle-home');
  env.JAVA_HOME = javaHome;
  if (src.ANDROID_HOME !== undefined) env.ANDROID_HOME = src.ANDROID_HOME;
  if (src.ANDROID_SDK_ROOT !== undefined) env.ANDROID_SDK_ROOT = src.ANDROID_SDK_ROOT;
  env.JAVA_TOOL_OPTIONS = '-Djava.net.preferIPv4Stack=true';
  return env;
}

/**
 * 生产 gradle 层(P0-1 冷路径沙箱):经 /usr/bin/sandbox-exec 把 ./gradlew 关进 macOS Seatbelt
 * (禁网络 outbound 留 loopback、Home 读闸、正向构造 env、注入 IPv4 JVM 参数)。GRADLE_USER_HOME
 * 钉在 demo 工程内(与 T1.1 约定一致)。fail-closed:非 macOS / sandbox-exec 不可用一律抛
 * SandboxError,profile 生成或子进程失败原样上抛,绝不回退裸 gradle。
 *
 * D-07(b):冷道构建内 kotlin daemon 可能继承并悬置 stdio 管道写端,导致 'close'(需等管道 EOF)
 * 永不触发、事件循环不排空(实证挂 22+ 分钟)。对策两条:①stdout 未消费,直接 ignore 不建管道;
 * ②stderr 仍需内容,但不再枯等 'close'——'exit' 后短宽限(容一次真正的 'close' 竞态)即强制
 * 完成并显式销毁句柄,不依赖对端(可能被悬置的)EOF。sandbox-exec 作为直接子进程,fd/退出语义
 * 透传,上述治理不变。
 */
export class SpawnGradleRunner implements GradleRunner {
  constructor(readonly extraArgs: string[] = []) {}

  async run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    if (process.platform !== 'darwin') {
      throw new SandboxError('UIV_SANDBOX_UNSUPPORTED_PLATFORM', `cold-path sandbox requires macOS (darwin); got platform=${process.platform}`);
    }
    try {
      accessSync(SANDBOX_EXEC, constants.X_OK);
    } catch {
      throw new SandboxError('UIV_SANDBOX_EXEC_UNAVAILABLE', `${SANDBOX_EXEC} not found or not executable`);
    }

    // 路径规范化(canonical):Seatbelt 按真实路径匹配,故 realpath 后再进 profile。
    const userHome = realpathSync(os.homedir());
    const workspaceRoot = realpathSync(cwd);
    const detectedSdk = detectAndroidSdk(cwd);
    const androidSdk = detectedSdk !== undefined ? realpathSync(detectedSdk) : undefined;
    const javaHome = realpathSync(detectJavaHome(cwd));
    const detectedMaven = detectMavenRepo();
    const mavenRepo = detectedMaven !== undefined ? realpathSync(detectedMaven) : undefined;

    const profileOpts: ColdPathProfileOpts = {
      userHome,
      workspaceRoot,
      javaHome,
      ...(androidSdk !== undefined ? { androidSdk } : {}),
      ...(mavenRepo !== undefined ? { mavenRepo } : {}),
    };
    const profile = buildColdPathProfile(profileOpts);

    const tmpProfileDir = mkdtempSync(path.join(os.tmpdir(), 'uiv-sb-'));
    const profilePath = path.join(tmpProfileDir, 'cold.sb');
    writeFileSync(profilePath, profile);

    const env = buildColdPathEnv(cwd, javaHome);

    try {
      return await new Promise<{ exitCode: number; stderr: string }>((resolve, reject) => {
        const child = spawn(SANDBOX_EXEC, ['-f', profilePath, './gradlew', ...this.extraArgs, ...args], {
          cwd,
          env,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';
        let exitCode: number | null = null;
        let settled = false;
        let closeGraceTimer: ReturnType<typeof setTimeout> | null = null;
        child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        child.on('error', reject);
        const finish = (): void => {
          if (settled) return;
          settled = true;
          if (closeGraceTimer !== null) clearTimeout(closeGraceTimer);
          child.stderr.destroy();   // 显式释放句柄:即便对端仍悬置管道,我方句柄一关,事件循环即可排空
          resolve({ exitCode: exitCode ?? 1, stderr });
        };
        child.on('close', (code) => { exitCode = code; finish(); });
        child.on('exit', (code) => {
          exitCode = code;
          closeGraceTimer = setTimeout(finish, 300);
        });
      });
    } finally {
      rmSync(tmpProfileDir, { recursive: true, force: true });   // 删临时 profile(含目录)
    }
  }
}

/** 单请求单连接:写一行 JSON,读到首个 \n 即完成;超时/错误按约定 reject。 */
export function request(sockPath: string, req: { id: string; cmd: string } & Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const sock = connect(sockPath);
    let buf = '';
    const timer = setTimeout(() => { sock.destroy(); reject(new Error(`daemon timeout ${timeoutMs}ms`)); }, timeoutMs);
    sock.on('error', (e) => { clearTimeout(timer); sock.destroy(); reject(e); });
    sock.on('connect', () => { sock.write(`${JSON.stringify(req)}\n`); });
    sock.on('data', (d: Buffer) => {
      buf += d.toString();
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      clearTimeout(timer);
      sock.end();
      const res = JSON.parse(buf.slice(0, nl)) as { ok: boolean; payload?: unknown; error?: string };
      if (!res.ok) { reject(new Error(`daemon error: ${res.error ?? 'unknown'}`)); return; }
      resolve(res.payload);
    });
  });
}

/** 热路径 runner:UDS 薄客户端,gradle.run 透传 cwd/args,payload 校验后原样返回。 */
export class UdsGradleRunner implements GradleRunner {
  constructor(private readonly sockPath: string) {}

  async run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    const payload = await request(this.sockPath, { id: randomUUID(), cmd: 'gradle.run', args: { cwd, args } }, 600_000);
    if (
      typeof payload !== 'object' || payload === null
      || typeof (payload as { exitCode?: unknown }).exitCode !== 'number'
      || typeof (payload as { stderr?: unknown }).stderr !== 'string'
    ) {
      throw new Error('daemon payload malformed');
    }
    return payload as { exitCode: number; stderr: string };
  }
}

/**
 * T2.8 快车道:请 daemon 托管的 Paparazzi worker 渲染 preview,产 PNG + 语义树到指定路径。
 * daemon 不可达 / worker stale / worker 崩溃 / 渲染错 一律 reject —— 由调用方回落慢车道并标注 lane。
 */
export async function renderPreviewViaDaemon(
  sockPath: string, previewFqn: string, outPng: string, outSemantics: string,
): Promise<{ png: string; semantics: string; renderMs: number; semanticsMs: number }> {
  const payload = await request(
    sockPath,
    { id: randomUUID(), cmd: 'renderPreview', render: { previewFqn, outPng, outSemantics } },
    300_000,
  );
  if (
    typeof payload !== 'object' || payload === null
    || typeof (payload as { png?: unknown }).png !== 'string'
    || typeof (payload as { semantics?: unknown }).semantics !== 'string'
  ) {
    throw new Error('renderPreview payload malformed');
  }
  return payload as { png: string; semantics: string; renderMs: number; semanticsMs: number };
}

/**
 * 选路:P0-1 alpha 冷路径沙箱为唯一交付 —— daemon/worker 代码级硬禁用(无逃生开关),
 * 恒返回冷道 SpawnGradleRunner(内部经 sandbox-exec 关进 Seatbelt)。不再探测 daemon.sock,
 * 即便 daemon 存活亦不选热道。UdsGradleRunner 保留供 P1 daemon 沙箱化后复活。
 */
export async function selectGradleRunner(
  _uiVerifyDir: string,
): Promise<{ runner: GradleRunner; lane: 'hot' | 'cold'; reason: string }> {
  // P0-8 批次②-fix(修正④,codex 019f6029):冷道显式 --offline(约束依赖解析拒网,与沙箱拒网互补非替代;
  // 满足"预热后 --offline 跑通"的 D 判据)。仅沙箱冷道自动加,不加面向用户的 uiv --offline 参数。
  return { runner: new SpawnGradleRunner(['--no-daemon', '--offline']), lane: 'cold', reason: 'P0-1: daemon disabled (cold-path sandbox only); P0-8 fix: --offline' };
}
