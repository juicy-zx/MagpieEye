/**
 * P0-1 冷路径 macOS Seatbelt(sandbox-exec)profile 生成器。
 *
 * 策略 = 默认放行 → 只上两道闸:
 *   ① 网络:禁 outbound,仅留 loopback(gradle 双栈守护经 IPv4 回环通信,配合 JVM
 *      -Djava.net.preferIPv4Stack=true 绑纯 127.0.0.1;Seatbelt `remote ip` host 仅认
 *      `*`/`localhost` 字面量,数字 IP 拒解析,故用 "localhost:*")。
 *   ② 文件:Home 读闸 —— 禁 userHome 的文件【内容】读(file-read-data),例外放行
 *      workspace/androidSdk/javaHome/mavenRepo 四类 subpath。这些"$HOME 下的工具链路径"仅当
 *      落在 userHome 之下才需显式放行(否则 /Library、/System 等已被 allow default 覆盖);
 *      workspaceRoot 恒放行。写权限不设闸(gradle 构建产物需写)。
 *      ⚠ mavenRepo(~/.m2/repository):Robolectric 依赖解析器从 Maven 本地库读
 *        android-all-instrumented(含 native runtime),blanket deny 挡其内容 → 原生运行时初始化
 *        NPE(AndroidVersions.CURRENT null)、testDebugUnitTest 失败。此库仅存公共构建产物(无
 *        秘密),放行其内容读不损威胁模型。【P0-1 对 codex 定稿 allow-list 的必要补全,待确认】
 *
 * ⚠ 用 file-read-data(仅内容)而非 file-read*(内容+元数据):blanket `deny file-read*
 *   (subpath userHome)` 会连带禁掉 file-read-metadata(stat/路径遍历),导致 JVM/dyld 启动即
 *   SIGSEGV(实证 `java -version` 零输出崩溃 → testDebugUnitTest 无法运行)。file-read-data 只禁
 *   文件内容读、放行元数据遍历:JVM 正常启动,而 ~/.ssh 等秘密文件【内容】仍 EPERM(秘密防泄漏
 *   目标不变,仅文件名/大小等元数据可被 stat)。
 *
 * SBPL 规则"后者覆盖前者",故 deny 在前、放行例外在后。
 * 调用方须先把路径 realpath 规范化再传入;本模块只负责 SBPL 字符串拼装与转义。
 */

export interface ColdPathProfileOpts {
  /** realpath 后的用户主目录(读闸 deny 根)。 */
  userHome: string;
  /** realpath 后的 gradle 工程根(= runner cwd);恒放行。 */
  workspaceRoot: string;
  /** realpath 后的 Android SDK;缺省 或 不在 userHome 之下 → 不输出放行行。 */
  androidSdk?: string;
  /** realpath 后的 JDK Home;缺省 或 不在 userHome 之下 → 不输出放行行。 */
  javaHome?: string;
  /** realpath 后的 Maven 本地库(~/.m2/repository);Robolectric 依赖来源,缺省/不在 home 下 → 不输出。 */
  mavenRepo?: string;
}

/** SBPL 双引号字符串字面量转义:先反斜杠、后双引号(顺序不可换,否则二次转义)。 */
export function escapeSbplString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** p 是否落在 base subpath 之下(含相等);base/p 均须已 realpath。 */
function isUnderSubpath(p: string, base: string): boolean {
  return p === base || p.startsWith(base.endsWith('/') ? base : `${base}/`);
}

export function buildColdPathProfile(opts: ColdPathProfileOpts): string {
  const quote = (p: string): string => `"${escapeSbplString(p)}"`;
  const lines: string[] = [
    '(version 1)',
    '(allow default)',
    // 文件 Home 读闸:先禁 userHome 文件内容读,再逐一放行例外 subpath(后者覆盖)。
    // 用 file-read-data(非 file-read*):保留元数据遍历以免 JVM 启动 SIGSEGV(见文件头注释)。
    `(deny file-read-data (subpath ${quote(opts.userHome)}))`,
    `(allow file-read-data (subpath ${quote(opts.workspaceRoot)}))`,
  ];
  if (opts.androidSdk !== undefined && isUnderSubpath(opts.androidSdk, opts.userHome)) {
    lines.push(`(allow file-read-data (subpath ${quote(opts.androidSdk)}))`);
  }
  if (opts.javaHome !== undefined && isUnderSubpath(opts.javaHome, opts.userHome)) {
    lines.push(`(allow file-read-data (subpath ${quote(opts.javaHome)}))`);
  }
  if (opts.mavenRepo !== undefined && isUnderSubpath(opts.mavenRepo, opts.userHome)) {
    lines.push(`(allow file-read-data (subpath ${quote(opts.mavenRepo)}))`);
  }
  // 网络闸:禁 outbound,仅留 loopback。
  lines.push(
    '(deny network-outbound)',
    '(allow network-outbound (remote ip "localhost:*"))',
  );
  return `${lines.join('\n')}\n`;
}
