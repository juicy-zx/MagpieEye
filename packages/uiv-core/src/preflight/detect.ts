/**
 * P0-8 批次②:目标工程版本/结构静态探测(顺应工程配置,不跑 gradle)。
 * codex Phase 1 决断 B:
 *   - 7 轴静态解析:Gradle(gradle-wrapper.properties 正则)、AGP/ComposeBOM/Robolectric/
 *     Roborazzi/Compose 编译器插件(libs.versions.toml)、compileSdk/minSdk(模块 build.gradle.kts
 *     正则)、模块类型(build.gradle alias + toml [plugins] id 双文件 join)。
 *   - Kotlin/KGP 显示 'unknown'(不拿 kotlinComposePlugin 当 KGP 代理);composeCompilerPlugin 单独报声明值。
 *   - 静态声明只是"发现信号"非兼容性证明:数值原样带出,兼容性判定留 preflight 状态机。
 *
 * 现成范式沿用 gradle-runner.ts 的 detectJavaHome/detectAndroidSdk(读 *.properties 正则);此处扩展到
 * libs.versions.toml TOML 键 + build.gradle.kts 正则 + wrapper.properties。alpha 只做静态正则,convention
 * plugin / 非静态 minSdk / 复杂 Gradle 形态的可靠解析留 v0.2。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveModuleDir } from '../util/module.js';

/** minSdk/compileSdk 静态解析三态:数值确认 / 存在但不可静态确认(变量/表达式)/ 完全缺失。 */
export type SdkValue =
  | { kind: 'value'; value: number }
  | { kind: 'unconfirmed'; raw: string }   // 声明存在但 RHS 非纯整数(变量引用/表达式)
  | { kind: 'absent' };                    // 未声明

/** 模块类型三态:application / 其它已知 android 插件(library 等)/ 无法静态确认。 */
export type ModuleType =
  | { kind: 'application' }
  | { kind: 'other'; pluginId: string }    // 解析出 android 插件但非 application(如 com.android.library)
  | { kind: 'unconfirmed' };               // 未能静态解析出任何可识别的 android 插件 id

export interface DetectedStack {
  moduleDir: string;
  moduleBuildFileFound: boolean;
  /** Gradle wrapper 声明版本(gradle-wrapper.properties distributionUrl);缺失 → null。 */
  gradle: string | null;
  /** libs.versions.toml [versions] 声明值;缺失 → null。 */
  agp: string | null;
  composeBom: string | null;
  robolectric: string | null;
  roborazzi: string | null;
  /** Compose 编译器插件声明值(toml kotlinComposePlugin);单独报,不当 KGP 代理。 */
  composeCompilerPlugin: string | null;
  /** codex 决断:Kotlin/KGP 恒 'unknown'(AGP9 内建 Kotlin,不静态代理)。 */
  kotlin: 'unknown';
  compileSdk: SdkValue;
  minSdk: SdkValue;
  moduleType: ModuleType;
}

/** 读文件文本;不存在/读失败 → null。 */
function readText(path: string): string | null {
  if (!existsSync(path)) return null;
  try { return readFileSync(path, 'utf8'); } catch { return null; }
}

/** gradle-wrapper.properties distributionUrl → 版本(gradle-<VER>-bin.zip / -all.zip)。 */
export function parseGradleVersion(wrapperText: string | null): string | null {
  if (wrapperText === null) return null;
  const m = wrapperText.match(/gradle-([0-9][0-9A-Za-z.\-]*)-(?:bin|all)\.zip/);
  return m?.[1] ?? null;
}

/** libs.versions.toml [versions] 单键取值(targeted 正则,alpha 不引 TOML 解析依赖)。 */
export function parseTomlVersion(tomlText: string | null, key: string): string | null {
  if (tomlText === null) return null;
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = tomlText.match(new RegExp(`(?:^|\\n)\\s*${esc}\\s*=\\s*"([^"]+)"`));
  return m?.[1] ?? null;
}

/** build.gradle(.kts) 单值 SDK 声明解析(compileSdk/minSdk/targetSdk):数值/不可确认/缺失。 */
export function parseSdkValue(buildText: string | null, key: string): SdkValue {
  if (buildText === null) return { kind: 'absent' };
  // 词边界锚定(容行首独立声明与 defaultConfig { minSdk = 26 } 内联两种写法);token 到首个空白/注释/换行止。
  const m = buildText.match(new RegExp(`\\b${key}\\b\\s*=\\s*([^\\s/\\n]+)`));
  if (m?.[1] === undefined) return { kind: 'absent' };
  const raw = m[1];
  return /^\d+$/.test(raw) ? { kind: 'value', value: Number(raw) } : { kind: 'unconfirmed', raw };
}

/** toml [plugins] alias → id 映射(alias = { id = "..." })。 */
export function parseTomlPluginIds(tomlText: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (tomlText === null) return out;
  const re = /(?:^|\n)\s*([A-Za-z0-9_-]+)\s*=\s*\{[^}\n]*\bid\s*=\s*"([^"]+)"/g;
  for (let m = re.exec(tomlText); m !== null; m = re.exec(tomlText)) {
    out.set(m[1]!, m[2]!);
  }
  return out;
}

/**
 * 模块类型双文件 join:模块 build.gradle(.kts) plugins 块内的
 *   - `alias(libs.plugins.<accessor>)` → toml [plugins] 键(accessor 点转横杠)→ id
 *   - `id("<literal>")`               → 直接 id
 * 收集所有已应用 android 插件 id,判定 application / other / unconfirmed。
 */
export function detectModuleType(buildText: string | null, pluginIds: Map<string, string>): ModuleType {
  if (buildText === null) return { kind: 'unconfirmed' };
  const ids: string[] = [];
  const aliasRe = /alias\(\s*libs\.plugins\.([A-Za-z0-9_.]+)\s*\)/g;
  for (let m = aliasRe.exec(buildText); m !== null; m = aliasRe.exec(buildText)) {
    const tomlKey = m[1]!.replace(/\./g, '-');
    const id = pluginIds.get(tomlKey);
    if (id !== undefined) ids.push(id);
  }
  const idRe = /id\(\s*"([^"]+)"\s*\)/g;
  for (let m = idRe.exec(buildText); m !== null; m = idRe.exec(buildText)) {
    ids.push(m[1]!);
  }
  if (ids.includes('com.android.application')) return { kind: 'application' };
  const androidPlugin = ids.find((id) => id.startsWith('com.android.'));
  if (androidPlugin !== undefined) return { kind: 'other', pluginId: androidPlugin };
  return { kind: 'unconfirmed' };
}

/**
 * 静态探测目标工程声明栈。projectRoot=工程根;projectPath=Gradle project path(默认 :app);
 * moduleDirOverride 显式给定时优先(alpha 默认约定映射 :app→<root>/app)。
 * 读:<root>/gradle/wrapper/gradle-wrapper.properties、<root>/gradle/libs.versions.toml、
 *     <moduleDir>/build.gradle(.kts)。全部静态正则,不跑 gradle。
 */
export function detectStack(
  projectRoot: string,
  opts: { projectPath?: string; moduleDir?: string } = {},
): DetectedStack {
  const moduleDir = resolveModuleDir(projectRoot, opts.moduleDir, opts.projectPath);
  const wrapperText = readText(join(projectRoot, 'gradle', 'wrapper', 'gradle-wrapper.properties'));
  const tomlText = readText(join(projectRoot, 'gradle', 'libs.versions.toml'));
  const buildKts = readText(join(moduleDir, 'build.gradle.kts'));
  const buildGroovy = buildKts === null ? readText(join(moduleDir, 'build.gradle')) : null;
  const buildText = buildKts ?? buildGroovy;
  const pluginIds = parseTomlPluginIds(tomlText);

  return {
    moduleDir,
    moduleBuildFileFound: buildText !== null,
    gradle: parseGradleVersion(wrapperText),
    agp: parseTomlVersion(tomlText, 'agp'),
    composeBom: parseTomlVersion(tomlText, 'composeBom'),
    robolectric: parseTomlVersion(tomlText, 'robolectric'),
    roborazzi: parseTomlVersion(tomlText, 'roborazzi'),
    composeCompilerPlugin: parseTomlVersion(tomlText, 'kotlinComposePlugin'),
    kotlin: 'unknown',
    compileSdk: parseSdkValue(buildText, 'compileSdk'),
    minSdk: parseSdkValue(buildText, 'minSdk'),
    moduleType: detectModuleType(buildText, pluginIds),
  };
}
