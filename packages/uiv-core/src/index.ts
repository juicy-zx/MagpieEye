/**
 * uiv-core: 鹊眼裁判/基准/报告纯逻辑库。
 * CLI(uiv)与 MCP server(ui-verify)均为本库薄壳。
 */
export const UIV_CORE_VERSION = '0.0.1'

export * from './figma/types.js'
export * from './figma/normalize.js'
export * from './figma/client.js'
export * from './report/v0.js'
export * from './report/v1.js'
export * from './l1/engine.js'
export * from './l1/ignore.js'
export * from './baseline/pull.js'
export * from './check/run.js'
export * from './check/runL2.js'

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
