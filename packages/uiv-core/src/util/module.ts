/**
 * P0-8 批次②:参数化共用纯函数(顺应工程配置)。
 * codex Phase 1 决断 C:
 *   - --module 语义 = Gradle project path(:app),非目录名;alpha 用默认目录映射
 *     (:app → <root>/app、:feature:login → <root>/feature/login),不解析 settings 的
 *     project(":app").projectDir 改写(留 v0.2),不全仓库猜测搜索。
 *   - --variant 按标准 Android 单测任务约定派生 task 名(debug → testDebugUnitTest);
 *     有 flavor 须显式 variant(如 freeDebug → testFreeDebugUnitTest);alpha 不做自动发现/
 *     --task 覆盖/非标准映射。
 */
import { join } from 'node:path';

/** Gradle project path → 默认约定模块目录(不查 settings projectDir,不猜测搜索)。空/仅冒号即抛。 */
export function projectPathToModuleDir(projectRoot: string, projectPath: string): string {
  const segs = projectPath.split(':').filter((s) => s.length > 0);
  if (segs.length === 0) throw new Error(`invalid Gradle module path: "${projectPath}"`);
  return join(projectRoot, ...segs);
}

/**
 * 核心统一模块目录解析:显式 moduleDir 优先,否则 projectPath(默认 :app)按约定映射。
 * 默认 :app → <demoDir>/app(与既有硬编码 'app' 等价,向后兼容)。
 */
export function resolveModuleDir(demoDir: string, moduleDir?: string, moduleName?: string): string {
  if (moduleDir !== undefined) return moduleDir;
  return projectPathToModuleDir(demoDir, moduleName ?? ':app');
}

/**
 * P0-8 批次②-fix(codex 019f6029 修正①):限定式 Gradle 单测任务名。
 * 未限定 test<Variant>UnitTest 从工程根执行会命中多模块同名任务、--module 未真参与任务选择;
 * 故让已解析的 Gradle project path 进任务串 → `<moduleName>:test<Variant>UnitTest`
 * (moduleName 含前导冒号,如 :app → `:app:testDebugUnitTest`、:feature:login → `:feature:login:testFreeDebugUnitTest`)。
 * moduleName 为空/仅冒号即抛(复用 projectPathToModuleDir 同款校验);variant 仅首字母大写,支持 flavor 拼接。
 */
export function unitTestTask(moduleName: string, variant: string): string {
  if (moduleName.split(':').filter((s) => s.length > 0).length === 0) {
    throw new Error(`invalid Gradle module path: "${moduleName}"`);
  }
  const v = variant.trim();
  if (v.length === 0) throw new Error('variant must be non-empty');
  return `${moduleName}:test${v.charAt(0).toUpperCase()}${v.slice(1)}UnitTest`;
}
