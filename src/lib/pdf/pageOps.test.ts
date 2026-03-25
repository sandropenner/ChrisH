import { describe, expect, it } from 'vitest'

import { createInitialPageModels } from './pageOps'

describe('pageOps', () => {
  it('creates requested page models', () => {
    const pages = createInitialPageModels(3)
    expect(pages).toHaveLength(3)
    expect(new Set(pages.map((p) => p.pageId)).size).toBe(3)
    expect(pages[2].currentOrderIndex).toBe(2)
  })
})
