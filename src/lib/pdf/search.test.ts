import { describe, expect, it } from 'vitest'

import { searchPdf } from './search'

describe('searchPdf', () => {
  it('finds query matches and tracks page index', async () => {
    const proxy = {
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({ width: 600, height: 800 }),
        getTextContent: async () => ({
          items: [
            {
              str: 'Hello PDF world',
              transform: [1, 0, 0, 12, 20, 40],
              width: 120,
            },
          ],
        }),
      }),
    }

    const matches = await searchPdf(proxy as never, [{ pageId: 'p1' } as never], 'pdf')

    expect(matches.length).toBe(1)
    expect(matches[0].pageIndex).toBe(0)
    expect(matches[0].pageId).toBe('p1')
  })
})
