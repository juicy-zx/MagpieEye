#!/usr/bin/env node
/**
 * uiv: 鹊眼薄验收客户端。
 * 子命令(按 M1/M2/M3 逐步落地): pin / baseline / check / verify-page / report
 */
import { UIV_CORE_VERSION } from '@magpie-eye/uiv-core'

const [, , command] = process.argv

if (command === undefined || command === '--version') {
  console.log(`uiv ${UIV_CORE_VERSION}`)
  process.exit(0)
}

console.error(`uiv: unknown command '${command}' (available: --version)`)
process.exit(1)
