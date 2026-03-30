import { useState } from 'react'
import { CSS } from '@dnd-kit/utilities'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Document, Page } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { usePdfObjectUrl } from '../lib/pdf/usePdfObjectUrl'
import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'
import type { PageModel } from '../types/models'

type DragState = {
  activeId: string | null
  overId: string | null
}

function getLoadErrorMessage(error: unknown): string {
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

function SortableThumbnail({
  pageModel,
  pageIndex,
  isCurrentPage,
  dragState,
}: {
  pageModel: PageModel
  pageIndex: number
  isCurrentPage: boolean
  dragState: DragState
}) {
  const state = useEditorStore((s) => s)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: pageModel.pageId,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`thumb-item ${isCurrentPage ? 'active' : ''} ${pageModel.selected ? 'selected' : ''} ${
        dragState.overId === pageModel.pageId && dragState.activeId !== pageModel.pageId ? 'drop-target' : ''
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      onClick={(event) => {
        if (event.ctrlKey || event.metaKey) {
          state.selectPage(pageModel.pageId, true)
          return
        }
        state.setCurrentPageIndex(pageIndex)
      }}
      {...attributes}
      {...listeners}
    >
      <span
        className={`thumb-select-dot ${pageModel.selected ? 'selected' : ''}`}
        title="Toggle page selection"
        role="button"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.preventDefault()
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
}

export function ThumbnailSidebar() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)
  const pdfObjectUrl = usePdfObjectUrl(active?.document.workingPdfBytes ?? null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [dragState, setDragState] = useState<DragState>({ activeId: null, overId: null })

  const pageModels = active?.document.workingPageModels ?? []
  const sortableItems = pageModels.map((page) => page.pageId)

  if (!active?.document.workingPdfBytes) {
    return <aside className="thumb-sidebar empty">Open a PDF to begin.</aside>
  }

  if (!pdfObjectUrl) {
    return <aside className="thumb-sidebar empty">Loading thumbnails...</aside>
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active: activeDrag, over } = event
    if (!over || activeDrag.id === over.id) {
      setDragState({ activeId: null, overId: null })
      return
    }
    const oldIndex = pageModels.findIndex((page) => page.pageId === activeDrag.id)
    const newIndex = pageModels.findIndex((page) => page.pageId === over.id)
    setDragState({ activeId: null, overId: null })
    if (oldIndex < 0 || newIndex < 0) return
    await state.reorderPages(oldIndex, newIndex)
  }

  return (
    <aside className="thumb-sidebar">
      <Document
        file={pdfObjectUrl}
        loading={<div className="muted">Loading thumbnails...</div>}
        onLoadSuccess={(proxy) => state.setLoadedPdfProxy(proxy as unknown as PDFDocumentProxy)}
        onLoadError={(error) => {
          console.error('[ThumbnailSidebar:onLoadError]', error)
          state.setStatusMessage(getLoadErrorMessage(error))
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setDragState({ activeId: String(event.active.id), overId: null })}
          onDragOver={(event) =>
            setDragState((current) => ({ ...current, overId: event.over ? String(event.over.id) : null }))
          }
          onDragCancel={() => setDragState({ activeId: null, overId: null })}
          onDragEnd={(event) => {
            void handleDragEnd(event)
          }}
        >
          <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
            <div className="thumb-list">
              {pageModels.map((pageModel, pageIndex) => (
                <SortableThumbnail
                  key={pageModel.pageId}
                  pageModel={pageModel}
                  pageIndex={pageIndex}
                  isCurrentPage={state.currentPageIndex === pageIndex}
                  dragState={dragState}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </Document>
    </aside>
  )
}
