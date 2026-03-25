import { useRef } from 'react'
import { Document, Page } from 'react-pdf'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { usePdfObjectUrl } from '../lib/pdf/usePdfObjectUrl'
import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'

export function ThumbnailSidebar() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)
  const pdfObjectUrl = usePdfObjectUrl(active?.document.workingPdfBytes ?? null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const pageCount = active?.document.workingPageModels.length ?? 0
  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 148,
    overscan: 4,
  })

  if (!active?.document.workingPdfBytes) {
    return <aside className="thumb-sidebar empty">Open a PDF to begin.</aside>
  }

  if (!pdfObjectUrl) {
    return <aside className="thumb-sidebar empty">Loading thumbnails...</aside>
  }

  return (
    <aside className="thumb-sidebar" ref={containerRef}>
      <Document
        file={pdfObjectUrl}
        loading={<div className="muted">Loading thumbnails...</div>}
        onLoadSuccess={(proxy) => state.setLoadedPdfProxy(proxy as unknown as PDFDocumentProxy)}
        onLoadError={(error) => {
          console.error('[ThumbnailSidebar:onLoadError]', error)
          state.setStatusMessage(getLoadErrorMessage(error))
        }}
      >
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const pageIndex = item.index
            const pageModel = active.document.workingPageModels[pageIndex]
            if (!pageModel) {
              return null
            }
            return (
              <button
                key={pageModel.pageId}
                type="button"
                className={`thumb-item ${state.currentPageIndex === pageIndex ? 'active' : ''} ${pageModel.selected ? 'selected' : ''}`}
                style={{ transform: `translateY(${item.start}px)` }}
                onClick={(event) => {
                  if (event.ctrlKey || event.metaKey) {
                    state.selectPage(pageModel.pageId, true)
                    return
                  }
                  state.setCurrentPageIndex(pageIndex)
                }}
              >
                <span
                  className={`thumb-select-dot ${pageModel.selected ? 'selected' : ''}`}
                  title="Toggle page selection"
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation()
                    state.selectPage(pageModel.pageId, true)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      event.stopPropagation()
                      state.selectPage(pageModel.pageId, true)
                    }
                  }}
                />
                <Page pageNumber={pageIndex + 1} width={110} renderTextLayer={false} renderAnnotationLayer={false} />
                <span className="thumb-label">{pageIndex + 1}</span>
              </button>
            )
          })}
        </div>
      </Document>
    </aside>
  )
}
  const getLoadErrorMessage = (error: unknown): string => {
    const text = error instanceof Error ? error.message : String(error)
    const lower = text.toLowerCase()
    if (lower.includes('password') || lower.includes('encrypted')) {
      return 'PDF.js requires a password for this file. Thumbnail generation failed.'
    }
    if (lower.includes('invalid') || lower.includes('corrupt')) {
      return 'Corrupt or invalid PDF. Thumbnails could not be generated.'
    }
    return `PDF.js render failure while generating thumbnails: ${text}`
  }
