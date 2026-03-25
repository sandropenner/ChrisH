import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { usePdfObjectUrl } from '../lib/pdf/usePdfObjectUrl'
import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'
import type { Annotation } from '../types/models'

function clamp(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function DocumentViewer() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)
  const pdfObjectUrl = usePdfObjectUrl(active?.document.workingPdfBytes ?? null)
  const pageShellRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<HTMLDivElement | null>(null)

  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({ width: 800, height: 1100 })
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 1200, height: 900 })
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragRect, setDragRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const container = viewerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      setContainerSize({ width: container.clientWidth, height: container.clientHeight })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const currentPageModel = active?.document.workingPageModels[state.currentPageIndex]
  const pageId = currentPageModel?.pageId
  const pageAnnotations = useMemo(() => {
    if (!active || !pageId) return []
    return active.document.annotationsByPage[pageId] ?? []
  }, [active, pageId])

  const scale = useMemo(() => {
    if (state.fitMode === 'custom') return state.zoom
    const padding = 32
    const widthScale = Math.max(0.2, (containerSize.width - padding) / pageSize.width)
    if (state.fitMode === 'width') return widthScale
    const heightScale = Math.max(0.2, (containerSize.height - padding) / pageSize.height)
    return Math.min(widthScale, heightScale)
  }, [state.fitMode, state.zoom, containerSize, pageSize])

  const currentMatch = useMemo(() => {
    if (!active) return null
    const search = active.document.searchState
    if (search.activeMatchIndex < 0 || search.activeMatchIndex >= search.matches.length) return null
    const match = search.matches[search.activeMatchIndex]
    if (match.pageIndex !== state.currentPageIndex) return null
    return match
  }, [active, state.currentPageIndex])

  const toRectNorm = (x: number, y: number, width: number, height: number): { x: number; y: number; width: number; height: number } => {
    if (!pageShellRef.current) return { x: 0, y: 0, width: 0, height: 0 }
    const box = pageShellRef.current.getBoundingClientRect()
    return {
      x: clamp((x - box.left) / box.width),
      y: clamp((y - box.top) / box.height),
      width: clamp(width / box.width),
      height: clamp(height / box.height),
    }
  }

  const handlePageLoad = (page: { getViewport: (input: { scale: number }) => { width: number; height: number } }) => {
    const viewport = page.getViewport({ scale: 1 })
    setPageSize({ width: viewport.width, height: viewport.height })
  }

  const finalizeWhiteout = () => {
    if (!dragRect || !pageId) {
      setDragRect(null)
      setDragStart(null)
      return
    }
    const replacement = window.prompt('Replacement text (optional):', '') ?? ''
    state.addWhiteout(pageId, dragRect, replacement)
    setDragRect(null)
    setDragStart(null)
  }

  const applyHighlightFromSelection = () => {
    if (state.tool !== 'highlight' || !pageId || !pageShellRef.current) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
    const pageBounds = pageShellRef.current.getBoundingClientRect()
    const range = selection.getRangeAt(0)
    const rects = Array.from(range.getClientRects())
      .map((rect) => {
        const left = Math.max(rect.left, pageBounds.left)
        const top = Math.max(rect.top, pageBounds.top)
        const right = Math.min(rect.right, pageBounds.right)
        const bottom = Math.min(rect.bottom, pageBounds.bottom)
        return {
          left,
          top,
          width: Math.max(0, right - left),
          height: Math.max(0, bottom - top),
        }
      })
      .filter((rect) => rect.width > 0 && rect.height > 0)
    const normalized = rects
      .map((rect) => toRectNorm(rect.left, rect.top, rect.width, rect.height))
      .filter((rect) => rect.width > 0.001 && rect.height > 0.001)
    if (normalized.length) {
      state.addHighlights(pageId, normalized)
    }
    selection.removeAllRanges()
  }

  const onOverlayMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (state.tool !== 'whiteout') return
    if (!pageShellRef.current) return
    const box = pageShellRef.current.getBoundingClientRect()
    setDragStart({ x: event.clientX - box.left, y: event.clientY - box.top })
    setDragRect(null)
  }

  const onOverlayMouseMove: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!dragStart || state.tool !== 'whiteout' || !pageShellRef.current) return
    const box = pageShellRef.current.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    const left = Math.min(dragStart.x, x)
    const top = Math.min(dragStart.y, y)
    const width = Math.abs(dragStart.x - x)
    const height = Math.abs(dragStart.y - y)
    setDragRect({ x: left / box.width, y: top / box.height, width: width / box.width, height: height / box.height })
  }

  const onOverlayMouseUp: React.MouseEventHandler<HTMLDivElement> = () => {
    if (state.tool === 'whiteout') {
      finalizeWhiteout()
      return
    }
  }

  const onOverlayClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!pageShellRef.current || !pageId) return

    if (state.tool === 'text') {
      const target = event.target as HTMLElement
      if (target.closest('.annot.text-overlay')) {
        return
      }
      const box = pageShellRef.current.getBoundingClientRect()
      const x = event.clientX
      const y = event.clientY
      const rect = {
        x: clamp((x - box.left) / box.width),
        y: clamp((y - box.top) / box.height),
        width: 0.25,
        height: 0.06,
      }
      state.addTextOverlay(pageId, rect)
      return
    }
  }

  const renderAnnotation = (annotation: Annotation) => {
    const style: React.CSSProperties = {
      left: `${annotation.rect.x * 100}%`,
      top: `${annotation.rect.y * 100}%`,
      width: `${annotation.rect.width * 100}%`,
      height: `${annotation.rect.height * 100}%`,
    }

    if (annotation.type === 'highlight') {
      return <div key={annotation.id} className="annot highlight" style={{ ...style, background: annotation.color, opacity: annotation.opacity }} />
    }

    if (annotation.type === 'whiteoutRect') {
      return <div key={annotation.id} className="annot whiteout" style={{ ...style, background: annotation.fill }} />
    }

    if (annotation.type === 'textOverlay' || annotation.type === 'replacementText') {
      return (
        <button
          key={annotation.id}
          type="button"
          className={`annot text-overlay ${state.selectedAnnotationId === annotation.id ? 'selected' : ''}`}
          style={{
            ...style,
            color: annotation.color,
            fontWeight: annotation.bold ? 700 : 500,
            fontSize: `${Math.max(8, annotation.fontSize * scale)}px`,
            lineHeight: 1.2,
            pointerEvents: state.tool === 'whiteout' ? 'none' : 'auto',
          }}
          onClick={(event) => {
            event.stopPropagation()
            state.selectAnnotation(annotation.id)
          }}
          onDoubleClick={(event) => {
            event.stopPropagation()
            const nextText = window.prompt('Edit text overlay:', annotation.text)
            if (nextText === null) return
            state.updateAnnotation(annotation.pageId, annotation.id, { text: nextText })
          }}
        >
          {annotation.text}
        </button>
      )
    }

    return null
  }

  if (!active?.document.workingPdfBytes) {
    return (
      <section className="viewer empty" ref={viewerRef}>
        <p className="muted">Open a PDF to view and edit pages.</p>
      </section>
    )
  }

  if (!pdfObjectUrl) {
    return (
      <section className="viewer empty" ref={viewerRef}>
        <p className="muted">Loading PDF...</p>
      </section>
    )
  }

  const safePageNumber = currentPageModel ? state.currentPageIndex + 1 : 1

  return (
    <section className="viewer" ref={viewerRef}>
      <Document
        file={pdfObjectUrl}
        loading={<p className="muted">Loading PDF...</p>}
        onLoadSuccess={(proxy) => {
          state.setLoadedPdfProxy(proxy as unknown as PDFDocumentProxy)
          if (active.document.editingLocked && active.document.editingLockReason) {
            state.setStatusMessage(active.document.editingLockReason)
          }
        }}
        onLoadError={(error) => {
          console.error('[DocumentViewer:onLoadError]', error)
          state.setStatusMessage(getLoadErrorMessage(error))
        }}
      >
        <div className="page-shell" ref={pageShellRef} onMouseUpCapture={applyHighlightFromSelection}>
          <Page
            pageNumber={safePageNumber}
            scale={scale}
            onLoadSuccess={handlePageLoad}
            renderAnnotationLayer={false}
            renderTextLayer
          />

          <div
            className={`overlay-layer ${state.tool === 'whiteout' || state.tool === 'text' ? 'capture' : 'passive'}`}
            onMouseDown={onOverlayMouseDown}
            onMouseMove={onOverlayMouseMove}
            onMouseUp={onOverlayMouseUp}
            onClick={onOverlayClick}
          >
            {currentPageModel ? pageAnnotations.map(renderAnnotation) : null}
            {dragRect ? (
              <div
                className="annot whiteout draft"
                style={{ left: `${dragRect.x * 100}%`, top: `${dragRect.y * 100}%`, width: `${dragRect.width * 100}%`, height: `${dragRect.height * 100}%` }}
              />
            ) : null}
            {currentMatch ? (
              <div
                className="annot search-active"
                style={{ left: `${currentMatch.rect.x * 100}%`, top: `${currentMatch.rect.y * 100}%`, width: `${currentMatch.rect.width * 100}%`, height: `${currentMatch.rect.height * 100}%` }}
              />
            ) : null}
          </div>
        </div>
      </Document>
    </section>
  )
}
  const getLoadErrorMessage = (error: unknown): string => {
    const text = error instanceof Error ? error.message : String(error)
    const lower = text.toLowerCase()
    if (lower.includes('password') || lower.includes('encrypted')) {
      return 'PDF.js requires a password for this file. It cannot be rendered without credentials.'
    }
    if (lower.includes('invalid') || lower.includes('corrupt')) {
      return 'Corrupt or invalid PDF. The file could not be rendered.'
    }
    return `PDF.js render failure: ${text}`
  }
