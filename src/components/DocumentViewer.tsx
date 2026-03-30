import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { usePdfObjectUrl } from '../lib/pdf/usePdfObjectUrl'
import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'
import type { Annotation, RectNorm } from '../types/models'

type DrawMode = 'text' | 'whiteout' | null

type TextTransform = {
  annotationId: string
  pageId: string
  kind: 'move' | 'resize'
  startClientX: number
  startClientY: number
  initialRect: RectNorm
}

function clamp(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function getLoadErrorMessage(error: unknown): string {
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

export function DocumentViewer() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)
  const pdfObjectUrl = usePdfObjectUrl(active?.document.workingPdfBytes ?? null)
  const pageShellRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<HTMLDivElement | null>(null)

  const [pageSize, setPageSize] = useState<{ width: number; height: number }>({ width: 800, height: 1100 })
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 1200, height: 900 })
  const [drawMode, setDrawMode] = useState<DrawMode>(null)
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null)
  const [draftRect, setDraftRect] = useState<RectNorm | null>(null)
  const draftRectRef = useRef<RectNorm | null>(null)
  const [textTransform, setTextTransform] = useState<TextTransform | null>(null)
  const [textPreviewRect, setTextPreviewRect] = useState<RectNorm | null>(null)
  const [spacePressed, setSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    const container = viewerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      setContainerSize({ width: container.clientWidth, height: container.clientHeight })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    draftRectRef.current = draftRect
  }, [draftRect])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      event.preventDefault()
      setSpacePressed(true)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      setSpacePressed(false)
      setIsPanning(false)
      panStartRef.current = null
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useEffect(() => {
    if (!isPanning || !viewerRef.current || !panStartRef.current) return

    const onMouseMove = (event: MouseEvent) => {
      const start = panStartRef.current
      if (!start || !viewerRef.current) return
      viewerRef.current.scrollLeft = start.left - (event.clientX - start.x)
      viewerRef.current.scrollTop = start.top - (event.clientY - start.y)
    }

    const onMouseUp = () => {
      setIsPanning(false)
      panStartRef.current = null
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isPanning])

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

  const canPan = state.fitMode === 'custom' && state.zoom > 1.01

  const currentMatch = useMemo(() => {
    if (!active) return null
    const search = active.document.searchState
    if (search.activeMatchIndex < 0 || search.activeMatchIndex >= search.matches.length) return null
    const match = search.matches[search.activeMatchIndex]
    if (match.pageIndex !== state.currentPageIndex) return null
    return match
  }, [active, state.currentPageIndex])

  const pointToNorm = (clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!pageShellRef.current) return null
    const box = pageShellRef.current.getBoundingClientRect()
    return {
      x: clamp((clientX - box.left) / box.width),
      y: clamp((clientY - box.top) / box.height),
    }
  }

  const toRectNorm = (x: number, y: number, width: number, height: number): RectNorm => {
    if (!pageShellRef.current) return { x: 0, y: 0, width: 0, height: 0 }
    const box = pageShellRef.current.getBoundingClientRect()
    return {
      x: clamp((x - box.left) / box.width),
      y: clamp((y - box.top) / box.height),
      width: clamp(width / box.width),
      height: clamp(height / box.height),
    }
  }

  const rectFromPoints = (start: { x: number; y: number }, end: { x: number; y: number }): RectNorm => {
    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(start.x - end.x)
    const height = Math.abs(start.y - end.y)
    return { x, y, width, height }
  }

  const handlePageLoad = (page: { getViewport: (input: { scale: number }) => { width: number; height: number } }) => {
    const viewport = page.getViewport({ scale: 1 })
    setPageSize({ width: viewport.width, height: viewport.height })
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
      state.closeToolPopover()
    }
    selection.removeAllRanges()
  }

  const startTextTransform = (
    event: React.MouseEvent,
    annotation: Extract<Annotation, { type: 'textOverlay' | 'replacementText' }>,
    kind: 'move' | 'resize',
  ) => {
    if (!pageId || (state.tool !== 'text' && state.tool !== 'select')) return
    event.preventDefault()
    event.stopPropagation()
    state.selectAnnotation(annotation.id)
    state.closeToolPopover()
    setTextTransform({
      annotationId: annotation.id,
      pageId,
      kind,
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialRect: { ...annotation.rect },
    })
    setTextPreviewRect({ ...annotation.rect })
  }

  useEffect(() => {
    if (!textTransform || !pageShellRef.current) return
    const box = pageShellRef.current.getBoundingClientRect()

    const onMouseMove = (event: MouseEvent) => {
      const deltaX = (event.clientX - textTransform.startClientX) / box.width
      const deltaY = (event.clientY - textTransform.startClientY) / box.height
      if (textTransform.kind === 'move') {
        const next: RectNorm = {
          x: clamp(textTransform.initialRect.x + deltaX),
          y: clamp(textTransform.initialRect.y + deltaY),
          width: textTransform.initialRect.width,
          height: textTransform.initialRect.height,
        }
        next.x = clamp(Math.min(next.x, 1 - next.width))
        next.y = clamp(Math.min(next.y, 1 - next.height))
        setTextPreviewRect(next)
        return
      }

      const minSize = 0.02
      const nextWidth = Math.max(minSize, Math.min(1 - textTransform.initialRect.x, textTransform.initialRect.width + deltaX))
      const nextHeight = Math.max(minSize, Math.min(1 - textTransform.initialRect.y, textTransform.initialRect.height + deltaY))
      setTextPreviewRect({
        x: textTransform.initialRect.x,
        y: textTransform.initialRect.y,
        width: nextWidth,
        height: nextHeight,
      })
    }

    const onMouseUp = () => {
      if (textPreviewRect) {
        state.updateAnnotation(textTransform.pageId, textTransform.annotationId, { rect: textPreviewRect })
      }
      setTextTransform(null)
      setTextPreviewRect(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [textTransform, textPreviewRect, state])

  const onOverlayMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!pageId || !pageShellRef.current) return
    if (event.button !== 0) return
    const target = event.target as HTMLElement
    if (state.tool === 'text' || state.tool === 'whiteout') {
      if (target.closest('.annot.text-overlay')) return
      const start = pointToNorm(event.clientX, event.clientY)
      if (!start) return
      event.preventDefault()
      state.closeToolPopover()
      setDrawMode(state.tool === 'text' ? 'text' : 'whiteout')
      setDrawStart(start)
      setDraftRect({ x: start.x, y: start.y, width: 0, height: 0 })
    }
  }

  useEffect(() => {
    if (!drawMode || !drawStart || !pageId) return

    const onMouseMove = (event: MouseEvent) => {
      const current = pointToNorm(event.clientX, event.clientY)
      if (!current) return
      setDraftRect(rectFromPoints(drawStart, current))
    }

    const onMouseUp = (event: MouseEvent) => {
      const end = pointToNorm(event.clientX, event.clientY)
      const finalRect = end ? rectFromPoints(drawStart, end) : draftRectRef.current

      if (finalRect && finalRect.width > 0.01 && finalRect.height > 0.01) {
        if (drawMode === 'text') {
          state.addTextOverlay(pageId, finalRect)
        } else {
          state.addWhiteout(pageId, finalRect)
        }
      }

      setDrawMode(null)
      setDrawStart(null)
      setDraftRect(null)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp, { once: true })
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [drawMode, drawStart, pageId, state])

  const renderAnnotation = (annotation: Annotation) => {
    const previewRect =
      textTransform?.annotationId === annotation.id && textPreviewRect ? textPreviewRect : annotation.rect
    const style: React.CSSProperties = {
      left: `${previewRect.x * 100}%`,
      top: `${previewRect.y * 100}%`,
      width: `${previewRect.width * 100}%`,
      height: `${previewRect.height * 100}%`,
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
          onMouseDown={(event) => startTextTransform(event, annotation, 'move')}
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
          <span
            className="resize-handle"
            onMouseDown={(event) => startTextTransform(event, annotation, 'resize')}
          />
        </button>
      )
    }

    return null
  }

  const onViewerWheel: React.WheelEventHandler<HTMLElement> = (event) => {
    if (!event.ctrlKey) return
    event.preventDefault()
    if (event.deltaY < 0) {
      state.zoomIn()
    } else {
      state.zoomOut()
    }
  }

  const onViewerMouseDown: React.MouseEventHandler<HTMLElement> = (event) => {
    if (event.button !== 0) return
    if (!canPan || !spacePressed || !viewerRef.current) return
    event.preventDefault()
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: viewerRef.current.scrollLeft,
      top: viewerRef.current.scrollTop,
    }
    setIsPanning(true)
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
    <section
      className={`viewer ${canPan && spacePressed ? 'pan-ready' : ''} ${isPanning ? 'panning' : ''}`}
      ref={viewerRef}
      onWheel={onViewerWheel}
      onMouseDown={onViewerMouseDown}
    >
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
            className={`overlay-layer ${state.tool === 'whiteout' || state.tool === 'text' ? 'capture crosshair' : 'passive'}`}
            onMouseDown={onOverlayMouseDown}
          >
            {currentPageModel ? pageAnnotations.map(renderAnnotation) : null}
            {draftRect ? (
              <div
                className={`annot ${drawMode === 'text' ? 'text-draft' : 'whiteout'} draft`}
                style={{
                  left: `${draftRect.x * 100}%`,
                  top: `${draftRect.y * 100}%`,
                  width: `${draftRect.width * 100}%`,
                  height: `${draftRect.height * 100}%`,
                }}
              />
            ) : null}
            {currentMatch ? (
              <div
                className="annot search-active"
                style={{
                  left: `${currentMatch.rect.x * 100}%`,
                  top: `${currentMatch.rect.y * 100}%`,
                  width: `${currentMatch.rect.width * 100}%`,
                  height: `${currentMatch.rect.height * 100}%`,
                }}
              />
            ) : null}
          </div>
        </div>
      </Document>
    </section>
  )
}
