import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  detectModuleType, detectStack, parseGradleVersion, parseSdkValue, parseTomlPluginIds, parseTomlVersion,
} from './detect.js';

describe('parseGradleVersion(gradle-wrapper.properties distributionUrl)', () => {
  it('bin 分发 → 版本', () => {
    expect(parseGradleVersion('distributionUrl=https\\://services.gradle.org/distributions/gradle-9.5.1-bin.zip')).toBe('9.5.1');
  });
  it('all 分发 + rc 版本', () => {
    expect(parseGradleVersion('distributionUrl=.../gradle-8.7-rc-1-all.zip')).toBe('8.7-rc-1');
  });
  it('缺失 → null', () => {
    expect(parseGradleVersion('foo=bar')).toBeNull();
    expect(parseGradleVersion(null)).toBeNull();
  });
});

describe('parseTomlVersion([versions] 单键)', () => {
  const toml = '[versions]\nagp = "9.0.1"\nroborazzi = "1.63.0"\nkotlinComposePlugin = "2.2.10" # 注释\n';
  it('取值(忽略行尾注释)', () => {
    expect(parseTomlVersion(toml, 'agp')).toBe('9.0.1');
    expect(parseTomlVersion(toml, 'roborazzi')).toBe('1.63.0');
    expect(parseTomlVersion(toml, 'kotlinComposePlugin')).toBe('2.2.10');
  });
  it('不存在键 / null → null', () => {
    expect(parseTomlVersion(toml, 'missing')).toBeNull();
    expect(parseTomlVersion(null, 'agp')).toBeNull();
  });
});

describe('parseSdkValue(数值/不可确认/缺失三态)', () => {
  it('纯整数 → value', () => {
    expect(parseSdkValue('    minSdk = 26 // CS2 注释', 'minSdk')).toEqual({ kind: 'value', value: 26 });
    expect(parseSdkValue('compileSdk = 36', 'compileSdk')).toEqual({ kind: 'value', value: 36 });
  });
  it('变量/表达式 RHS → unconfirmed', () => {
    expect(parseSdkValue('minSdk = libs.versions.minSdk.get().toInt()', 'minSdk')).toEqual({ kind: 'unconfirmed', raw: 'libs.versions.minSdk.get().toInt()' });
    expect(parseSdkValue('minSdk = MIN_SDK', 'minSdk')).toEqual({ kind: 'unconfirmed', raw: 'MIN_SDK' });
  });
  it('未声明 → absent', () => {
    expect(parseSdkValue('targetSdk = 36', 'minSdk')).toEqual({ kind: 'absent' });
    expect(parseSdkValue(null, 'minSdk')).toEqual({ kind: 'absent' });
  });
});

describe('detectModuleType(build.gradle alias + toml [plugins] id 双文件 join)', () => {
  const toml = '[plugins]\nandroid-application = { id = "com.android.application", version.ref = "agp" }\nandroid-library = { id = "com.android.library", version.ref = "agp" }\n';
  it('parseTomlPluginIds:alias → id 映射', () => {
    const m = parseTomlPluginIds(toml);
    expect(m.get('android-application')).toBe('com.android.application');
    expect(m.get('android-library')).toBe('com.android.library');
  });
  it('alias(libs.plugins.android.application) → application', () => {
    const build = 'plugins {\n  alias(libs.plugins.android.application)\n  alias(libs.plugins.kotlin.compose)\n}';
    expect(detectModuleType(build, parseTomlPluginIds(toml))).toEqual({ kind: 'application' });
  });
  it('直接 id("com.android.application") → application(无需 toml)', () => {
    expect(detectModuleType('plugins { id("com.android.application") }', new Map())).toEqual({ kind: 'application' });
  });
  it('library alias → other(pluginId=com.android.library)', () => {
    const build = 'plugins {\n  alias(libs.plugins.android.library)\n}';
    expect(detectModuleType(build, parseTomlPluginIds(toml))).toEqual({ kind: 'other', pluginId: 'com.android.library' });
  });
  it('无可识别 android 插件 → unconfirmed', () => {
    expect(detectModuleType('plugins { kotlin("jvm") }', new Map())).toEqual({ kind: 'unconfirmed' });
    expect(detectModuleType(null, new Map())).toEqual({ kind: 'unconfirmed' });
  });
});

// 实测基线锚:直接对真 demo-android 静态探测,校验解析器与 codex 第 1 组实测基线一致(不修改 demo-android,只读)。
describe('detectStack(真 demo-android)', () => {
  const demoRoot = fileURLToPath(new URL('../../../../demo-android', import.meta.url));
  it.skipIf(!existsSync(demoRoot))('解析出 codex 第 1 组实测基线声明值 + application/minSdk26/compileSdk36', () => {
    const s = detectStack(demoRoot, { projectPath: ':app' });
    expect(s.moduleBuildFileFound).toBe(true);
    expect(s.gradle).toBe('9.5.1');
    expect(s.agp).toBe('9.0.1');
    expect(s.composeBom).toBe('2026.06.00');
    expect(s.robolectric).toBe('4.16');
    expect(s.roborazzi).toBe('1.63.0');
    expect(s.composeCompilerPlugin).toBe('2.2.10');
    expect(s.kotlin).toBe('unknown');
    expect(s.compileSdk).toEqual({ kind: 'value', value: 36 });
    expect(s.minSdk).toEqual({ kind: 'value', value: 26 });
    expect(s.moduleType).toEqual({ kind: 'application' });
  });
});
