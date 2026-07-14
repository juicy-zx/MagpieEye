import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { projectPathToModuleDir, resolveModuleDir, unitTestTask } from './module.js';

describe('projectPathToModuleDir(Gradle project path → 约定目录)', () => {
  it(':app → <root>/app', () => {
    expect(projectPathToModuleDir('/proj', ':app')).toBe(join('/proj', 'app'));
  });
  it(':feature:login → <root>/feature/login(嵌套段逐级映射)', () => {
    expect(projectPathToModuleDir('/proj', ':feature:login')).toBe(join('/proj', 'feature', 'login'));
  });
  it('空/仅冒号抛错(不猜测搜索)', () => {
    expect(() => projectPathToModuleDir('/proj', ':')).toThrow();
    expect(() => projectPathToModuleDir('/proj', '')).toThrow();
  });
});

describe('resolveModuleDir(显式 moduleDir 优先,否则 projectPath 默认 :app→app)', () => {
  it('无 moduleDir/moduleName → <demoDir>/app(向后兼容)', () => {
    expect(resolveModuleDir('/demo')).toBe(join('/demo', 'app'));
  });
  it('显式 moduleDir 直用(不再映射)', () => {
    expect(resolveModuleDir('/demo', '/abs/mod', ':app')).toBe('/abs/mod');
  });
  it('仅 moduleName → 约定映射', () => {
    expect(resolveModuleDir('/demo', undefined, ':feature:x')).toBe(join('/demo', 'feature', 'x'));
  });
});

describe('unitTestTask(variant → test<Variant>UnitTest)', () => {
  it('debug → testDebugUnitTest(与既有硬编码等价)', () => {
    expect(unitTestTask('debug')).toBe('testDebugUnitTest');
  });
  it('flavor 拼接 variant 仅首字母大写', () => {
    expect(unitTestTask('freeDebug')).toBe('testFreeDebugUnitTest');
    expect(unitTestTask('release')).toBe('testReleaseUnitTest');
  });
  it('空 variant 抛错', () => {
    expect(() => unitTestTask('  ')).toThrow();
  });
});
