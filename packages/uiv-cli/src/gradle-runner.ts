/**
 * T2.1:uiv gradle runner。gradle 执行轴有两条 lane(与 fast/slow 渲染轴正交):
 *   direct  = DirectGradleRunner,以当前用户权限直连项目 ./gradlew(可信本地开发者默认;env 继承宿主、无策略注入);
 *   sandbox = SpawnGradleRunner,经 macOS Seatbelt(sandbox-exec)关进沙箱(P0-1,opt-in;--offline/--no-daemon/项目本地 GRADLE_USER_HOME/IPv4)。
 * P0-8 双 lane(codex 019f6029 设计 B/C/E):selectGradleRunner 按 requestedLane 分支,CLI 默认 direct、`--sandbox` 走沙箱;
 * 任一 lane 失败绝不回退另一 lane(codex C⑤ no-fallback,见 selectGradleRunner/SpawnGradleRunner)。
 * 热路径 = UdsGradleRunner 薄 UDS 客户端(P0-1 alpha 已代码级硬禁用,daemon 不可达,留待 P1);
 * UdsGradleRunner/renderPreviewViaDaemon 保留供 P1 复活。
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

/**
 * P0-8 direct lane runner —— 语义直连 + 执行卫生(codex 019f6029 设计 B),**非半沙箱**。
 * 以当前用户权限直 spawn 项目内 gradlew:
 *   ①不经 shell(argv 直传,无注入面);②command=<cwd>/gradlew 绝对路径,含斜杠故 execvp 不查 PATH(防 PATH 劫持替身);
 *   ③cwd=demoDir(子进程工作目录=工程根,gradlew 相对产物路径正确);④env 继承宿主(可信目录默认,不正向构造/不剔除);
 *   ⑤**不注入** GRADLE_USER_HOME 重定向 / --offline / --no-daemon / preferIPv4Stack / sandbox-exec —— 顺应工程配置。
 * stdio 卫生同冷道 D-07(b):stdout 不建管道(ignore),stderr 收集后 'exit' 触发短宽限即强制完成并显式销毁句柄,
 * 不枯等可能被长命 kotlin/gradle daemon 悬置的管道 EOF(防进程悬挂;exit-timing.test 端到端护栏)。
 * 失败(gradlew 非零 / spawn error)非零直穿,**绝不回退沙箱**(codex C⑤ no-fallback)。
 */
export class DirectGradleRunner implements GradleRunner {
  constructor(readonly extraArgs: string[] = []) {}

  async run(cwd: string, args: string[]): Promise<{ exitCode: number; stderr: string }> {
    const gradlew = path.join(cwd, 'gradlew');   // 绝对路径:含斜杠 → execvp 不查 PATH;显式项目内 gradlew
    return await new Promise<{ exitCode: number; stderr: string }>((resolve, reject) => {
      const child = spawn(gradlew, [...this.extraArgs, ...args], {
        cwd,                               // 子进程工作目录=工程根;env 省略 → 继承宿主(不注入)
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
        child.stderr.destroy();
        resolve({ exitCode: exitCode ?? 1, stderr });
      };
      child.on('close', (code) => { exitCode = code; finish(); });
      child.on('exit', (code) => {
        exitCode = code;
        closeGraceTimer = setTimeout(finish, 300);
      });
    });
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

export type RequestedLane = 'default' | 'sandbox';
export type SelectedBy = 'cli-default' | 'cli-flag' | 'mcp-policy' | 'ci-policy';

/** 选路入参(codex 019f6029 E):requestedLane=调用方请求的 lane;selectedBy=溯源(谁选的,进 receipt 防蒙混)。 */
export interface LaneRequest {
  requestedLane: RequestedLane;
  selectedBy: SelectedBy;
}

/**
 * execution receipt(codex 019f6029 E):父进程拥有、记实际执行姿态的独立命令 envelope(**不进 ReportV1**)。
 * 由 buildExecutionReceipt 从 LaneRequest 确定性派生 —— 非 gradle 自报。不记真实 $HOME 绝对路径。
 */
export interface ExecutionReceipt {
  requestedLane: RequestedLane;
  effectiveLane: 'direct' | 'sandbox';
  selectedBy: SelectedBy;
  runner: string;
  sandboxEstablished: boolean;
  gradleUserHomeMode: 'inherited' | 'project-local';
  networkMode: 'host' | 'denied-except-localhost';
  gradleOffline: boolean;
  /** init-script 替代 uiv-gradle-plugin 转发职能的绝对路径(demoDir 内)。buildExecutionReceipt 本身
   *  不知 demoDir,保持纯函数;由调用方(index.ts)按需补设,故为可选字段。 */
  initScript?: string;
}

/**
 * 从 LaneRequest 确定性构建 receipt(纯函数):direct/sandbox 两姿态各自的执行事实。
 * 父进程(CLI)可在命令执行前预算此 receipt,供成功路径与失败路径(main().catch)统一发射(codex E:两路径都须输出)。
 * no-fallback:effectiveLane 恒等于请求 lane 对应姿态,**绝不因 sandbox 失败改记 direct**;
 * sandbox 建立失败(SandboxError)由 CLI 侧把 sandboxEstablished 落回 false,effectiveLane 仍 sandbox。
 */
export function buildExecutionReceipt(opts: LaneRequest): ExecutionReceipt {
  if (opts.requestedLane === 'sandbox') {
    return {
      requestedLane: 'sandbox',
      effectiveLane: 'sandbox',
      selectedBy: opts.selectedBy,
      runner: 'SpawnGradleRunner',
      sandboxEstablished: true,
      gradleUserHomeMode: 'project-local',
      networkMode: 'denied-except-localhost',
      gradleOffline: true,
    };
  }
  return {
    requestedLane: 'default',
    effectiveLane: 'direct',
    selectedBy: opts.selectedBy,
    runner: 'DirectGradleRunner',
    sandboxEstablished: false,
    gradleUserHomeMode: 'inherited',
    networkMode: 'host',
    gradleOffline: false,
  };
}

/**
 * 选路(codex 019f6029 B/C/E):按 requestedLane 分支 gradle 执行 lane。
 *   'sandbox' → SpawnGradleRunner(冷道 Seatbelt;extraArgs 保留 --no-daemon --offline);
 *   'default' → DirectGradleRunner(直连,无任何策略注入)。
 * 单次选路只产一个 runner,无 try/catch 换 lane —— 任一 lane 失败非零直穿,绝不回退另一 lane(codex C⑤)。
 * P0-1 daemon/worker 仍代码级硬禁用(不探测 daemon.sock);UdsGradleRunner 保留供 P1 复活。
 * ⚠ 本轴(direct/sandbox)与 fast/slow 渲染轴(ReportV1.lane)正交独立,勿混淆。
 */
export async function selectGradleRunner(
  _uiVerifyDir: string,
  opts: LaneRequest,
): Promise<{ runner: GradleRunner; execution: ExecutionReceipt; reason: string }> {
  const execution = buildExecutionReceipt(opts);
  if (opts.requestedLane === 'sandbox') {
    // 冷道显式 --offline + --no-daemon(修正④,codex 019f6029):约束依赖解析拒网,与沙箱拒网互补;防孤儿 daemon 带旧 profile 长驻。
    return {
      runner: new SpawnGradleRunner(['--no-daemon', '--offline']),
      execution,
      reason: 'sandbox lane: P0-1 cold-path Seatbelt (opt-in) + --no-daemon --offline',
    };
  }
  return {
    runner: new DirectGradleRunner(),
    execution,
    reason: 'direct lane (CLI default): runs project gradle as current user; use --sandbox for untrusted/AI/CI',
  };
}
