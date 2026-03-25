import type { PDFDocumentProxy } from 'pdfjs-dist'

import type { PageModel, SearchMatch } from '../../types/models'
import { clamp01 } from '../geometry/rect'

interface SearchTextItem {
  str?: string
  transform: number[]
  width: number
}

function makePreview(input: string, start: number, length: number): string {
  const left = Math.max(0, start - 16)
  const right = Math.min(input.length, start + length + 16)
  return input.slice(left, right)
}

export async function searchPdf(proxy: PDFDocumentProxy, pageModels: PageModel[], query: string): Promise<SearchMatch[]> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return []
  }

  const results: SearchMatch[] = []

  for (let pageIndex = 0; pageIndex < proxy.numPages; pageIndex += 1) {
    const page = await proxy.getPage(pageIndex + 1)
    const viewport = page.getViewport({ scale: 1 })
    const textContent = await page.getTextContent()

    for (const item of textContent.items as SearchTextItem[]) {
      if (typeof item.str !== 'string' || item.str.length === 0) {
        continue
      }

      const textLower = item.str.toLowerCase()
      let cursor = textLower.indexOf(normalizedQuery)
      while (cursor !== -1) {
        const transform = item.transform as number[]
        const textLength = Math.max(1, item.str.length)
        const x = transform[4] + (item.width * cursor) / textLength
        const y = transform[5] - Math.abs(transform[3])
        const width = (item.width * normalizedQuery.length) / textLength
        const height = Math.max(Math.abs(transform[3]), 8)

        results.push({
          id: crypto.randomUUID(),
          pageIndex,
          pageId: pageModels[pageIndex]?.pageId ?? String(pageIndex),
          rect: {
            x: clamp01(x / viewport.width),
            y: clamp01(y / viewport.height),
            width: clamp01(width / viewport.width),
            height: clamp01(height / viewport.height),
          },
          preview: makePreview(item.str, cursor, normalizedQuery.length),
        })

        cursor = textLower.indexOf(normalizedQuery, cursor + normalizedQuery.length)
      }
    }
  }

  return results
}
