/**
 * uiv-core: 鹊眼裁判/基准/报告纯逻辑库。
 * CLI(uiv)与 MCP server(ui-verify)均为本库薄壳。
 */
export const UIV_CORE_VERSION = '0.0.1'

export * from './figma/types.js'
export * from './figma/normalize.js'
export * from './figma/client.js'
export * from './report/v0.js'
export * from './l1/engine.js'
export * from './l1/ignore.js'
