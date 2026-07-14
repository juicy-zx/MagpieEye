/**
 * P0-8 批次② preflight 六状态表(codex 第 4 组实测):逐项 fixture 化,断言预期 warning/error code。
 * 基线匹配 / 声明失配 / KGP 不可得 / minSdk=25 / minSdk 不可静态确认 / 非 application 模块;
 * 另补两条 codex 硬前置(模块目录无法定位 / application 身份无法静态确认)。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { PREFLIGHT_ERROR, W_DECLARED_STACK_UNVERIFIED, runPreflight } from './preflight.js';
import type { PreflightCheck, PreflightEnvelope } from './preflight.js';

const WRAPPER = 'distributionBase=GRADLE_USER_HOME\ndistributionUrl=https\\://services.gradle.org/distributions/gradle-9.5.1-bin.zip\n';
const TOML = [
  '[versions]',
  'agp = "9.0.1"',
  'kotlinComposePlugin = "2.2.10"',
  'composeBom = "2026.06.00"',
  'roborazzi = "1.63.0"',
  'robolectric = "4.16"',
  '[plugins]',
  'android-application = { id = "com.android.application", version.ref = "agp" }',
  'android-library = { id = "com.android.library", version.ref = "agp" }',
  'kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlinComposePlugin" }',
  'roborazzi = { id = "io.github.takahirom.roborazzi", version.ref = "roborazzi" }',
  '',
].join('\n');
const APP_APPLICATION = [
  'plugins {',
  '  alias(libs.plugins.android.application)',
  '  alias(libs.plugins.kotlin.compose)',
  '  alias(libs.plugins.roborazzi)',
  '}',
  'android {',
  '  compileSdk = 36',
  '  defaultConfig { minSdk = 26 }',
  '}',
  '',
].join('\n');

/** 组装临时工程:gradle/wrapper + gradle/libs.versions.toml + app/build.gradle.kts。appBuild=null 则不写模块 build 文件。 */
function scaffold(opts: { toml?: string; wrapper?: string; appBuild?: string | null } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'uiv-pf-'));
  mkdirSync(join(root, 'gradle', 'wrapper'), { recursive: true });
  writeFileSync(join(root, 'gradle', 'wrapper', 'gradle-wrapper.properties'), opts.wrapper ?? WRAPPER);
  writeFileSync(join(root, 'gradle', 'libs.versions.toml'), opts.toml ?? TOML);
  if (opts.appBuild !== null) {
    mkdirSync(join(root, 'app'), { recursive: true });
    writeFileSync(join(root, 'app', 'build.gradle.kts'), opts.appBuild ?? APP_APPLICATION);
  }
  return root;
}

const checkOf = (e: PreflightEnvelope, id: string): PreflightCheck => {
  const c = e.result.checks.find((x) => x.id === id);
  if (c === undefined) throw new Error(`check ${id} missing`);
  return c;
};

describe('preflight 六状态表', () => {
  it('① 基线匹配 → supported:true,exit 0,无 warning,error null', () => {
    const e = runPreflight(scaffold(), { projectPath: ':app' });
    expect(e.exitCode).toBe(0);
    expect(e.error).toBeNull();
    expect(e.result.supported).toBe(true);
    expect(e.result.warnings).toEqual([]);
    expect(e.result.checks.every((c) => c.ok)).toBe(true);
  });

  it('② 声明失配(roborazzi≠基线)→ W_DECLARED_STACK_UNVERIFIED,exit 0,supported:false(标未验证不显示兼容)', () => {
    const toml = TOML.replace('roborazzi = "1.63.0"', 'roborazzi = "9.9.9"');
    const e = runPreflight(scaffold({ toml }), { projectPath: ':app' });
    expect(e.exitCode).toBe(0);              // 放行,非拒绝
    expect(e.error).toBeNull();
    expect(e.result.supported).toBe(false);  // 不显示"兼容"
    expect(e.result.warnings.map((w) => w.code)).toEqual([W_DECLARED_STACK_UNVERIFIED]);
    expect(checkOf(e, 'roborazzi').ok).toBe(false);
    expect(checkOf(e, 'roborazzi').actual).toBe('9.9.9');
  });

  it('③ KGP 不可得 → Kotlin 显示 unknown(不失败),composeCompilerPlugin 单独报声明值', () => {
    const e = runPreflight(scaffold(), { projectPath: ':app' });
    expect(e.result.kotlin).toBe('unknown');                 // KGP 不作代理,恒 unknown
    expect(checkOf(e, 'composeCompilerPlugin').actual).toBe('2.2.10');  // 单独报
    expect(checkOf(e, 'composeCompilerPlugin').ok).toBe(true);
    expect(e.result.supported).toBe(true);                   // KGP unknown 不导致失败
    expect(e.error).toBeNull();
  });

  it('④ minSdk=25 → 硬前置 exit≠0 + error.code E_MIN_SDK_BELOW_MIN', () => {
    const appBuild = APP_APPLICATION.replace('minSdk = 26', 'minSdk = 25');
    const e = runPreflight(scaffold({ appBuild }), { projectPath: ':app' });
    expect(e.exitCode).not.toBe(0);
    expect(e.error?.code).toBe(PREFLIGHT_ERROR.MIN_SDK_BELOW_MIN);
    expect(e.error?.retryable).toBe(false);
    expect(e.result.supported).toBe(false);
    expect(checkOf(e, 'minSdk').ok).toBe(false);
  });

  it('⑤ minSdk 不可静态确认(变量引用)→ 硬前置无法确认 exit≠0 + E_MIN_SDK_UNCONFIRMED', () => {
    const appBuild = APP_APPLICATION.replace('minSdk = 26', 'minSdk = libs.versions.minSdk.get().toInt()');
    const e = runPreflight(scaffold({ appBuild }), { projectPath: ':app' });
    expect(e.exitCode).not.toBe(0);
    expect(e.error?.code).toBe(PREFLIGHT_ERROR.MIN_SDK_UNCONFIRMED);
    expect(checkOf(e, 'minSdk').actual).toContain('unconfirmed');
  });

  it('⑥ 非 application 模块(library)→ 硬前置 exit≠0 + E_NON_APPLICATION_MODULE', () => {
    const appBuild = APP_APPLICATION.replace('alias(libs.plugins.android.application)', 'alias(libs.plugins.android.library)');
    const e = runPreflight(scaffold({ appBuild }), { projectPath: ':app' });
    expect(e.exitCode).not.toBe(0);
    expect(e.error?.code).toBe(PREFLIGHT_ERROR.NON_APPLICATION_MODULE);
    expect(checkOf(e, 'moduleType').actual).toBe('com.android.library');
    expect(checkOf(e, 'moduleType').ok).toBe(false);
  });

  // 补:codex 另两条硬前置。
  it('⑦ 所选模块目录无法定位(无 build 文件)→ exit≠0 + E_MODULE_DIR_NOT_FOUND', () => {
    const e = runPreflight(scaffold({ appBuild: null }), { projectPath: ':app' });
    expect(e.exitCode).not.toBe(0);
    expect(e.error?.code).toBe(PREFLIGHT_ERROR.MODULE_DIR_NOT_FOUND);
  });

  it('⑧ application 身份无法静态确认(无可识别 android 插件)→ exit≠0 + E_APPLICATION_IDENTITY_UNCONFIRMED', () => {
    const appBuild = 'plugins {\n  kotlin("jvm")\n}\nandroid {\n  compileSdk = 36\n  defaultConfig { minSdk = 26 }\n}\n';
    const e = runPreflight(scaffold({ appBuild }), { projectPath: ':app' });
    expect(e.exitCode).not.toBe(0);
    expect(e.error?.code).toBe(PREFLIGHT_ERROR.APPLICATION_IDENTITY_UNCONFIRMED);
  });

  it('envelope 形状:command/exitCode/error/pass:null/artifacts:[]/result 齐备,--json 可 JSON.parse', () => {
    const e = runPreflight(scaffold(), { projectPath: ':app' });
    const round = JSON.parse(JSON.stringify(e)) as PreflightEnvelope;
    expect(round.command).toBe('environment.preflight');
    expect(round.pass).toBeNull();
    expect(round.artifacts).toEqual([]);
    expect(Array.isArray(round.result.checks)).toBe(true);
    expect(round.result.checks.map((c) => c.id)).toEqual([
      'gradle', 'agp', 'composeBom', 'robolectric', 'roborazzi', 'composeCompilerPlugin', 'compileSdk', 'minSdk', 'moduleType',
    ]);
  });
});
