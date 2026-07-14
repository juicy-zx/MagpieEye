/**
 * uiv-core: 鹊眼裁判/基准/报告纯逻辑库。
 * CLI(uiv)与 MCP server(ui-verify)均为本库薄壳。
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export const UIV_CORE_VERSION: string = require('../package.json').version

export * from './util/atomic.js'
export * from './util/module.js'
export * from './figma/types.js'
export * from './figma/normalize.js'
export * from './figma/client.js'
export * from './report/v0.js'
export * from './report/v1.js'
export * from './report/junit.js'
export * from './l1/engine.js'
export * from './l1/ignore.js'
export * from './baseline/pull.js'
export * from './check/run.js'
export * from './check/runL2.js'

// P0-8 批次②:preflight 静态探测 + environment.preflight envelope(共用层,CLI/MCP 复用)
export * from './preflight/detect.js'
export * from './preflight/preflight.js'

// L2 结构裁判引擎(T1.3)
export * from './l2/types.js'
export * from './l2/constants.js'
export * from './l2/rebase.js'
export * from './l2/nodeset.js'
export * from './l2/join.js'
export * from './l2/color.js'
export * from './l2/assert.js'
export * from './l2/metrics.js'
export * from './l2/verdict.js'
export * from './l2/stability.js'
export * from './l2/report.js'

// M2 barrel 集成:T2.2(odiff server)、T2.4(Figma REST/cache/quota/variables)、T2.5(L2 三级匹配降级)、T2.6(check record)
export * from './l1/server.js'
export * from './figma/quota.js'
export * from './figma/cache.js'
export * from './figma/rest.js'
export * from './figma/variables.js'
export * from './l2/similarity.js'
export * from './l2/lcs.js'
export * from './l2/match.js'
export * from './check/record.js'

export * from './baseline/mapping.js'
export * from './baseline/pin.js'
export * from './baseline/repersist.js'
export * from './baseline/version-check.js'

// T3.3:整页外循环(verify-page)。page/ 四模块 value + type export(source-attr 为 verifyPage 内部依赖,不透出)。
export * from './page/matrix.js'
export * from './page/classify.js'
export * from './page/report.js'
export * from './page/verifyPage.js'

// T4.2:vlm-judge L3(轻量形态必交付 + provider 接口,B3 受限)
export * from './page/l3/types.js'
export * from './page/l3/triptych.js'
export * from './page/l3/inputPack.js'
export * from './page/l3/attach.js'
export * from './page/l3/provider.js'
