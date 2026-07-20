import { describe, expect, it } from 'vitest'
import { UIV_CORE_VERSION } from './index.js'

describe('uiv-core scaffold', () => {
  it('exports a version', () => {
    expect(UIV_CORE_VERSION).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z-.]+)?$/)
  })
})
