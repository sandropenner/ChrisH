import { CSS } from '@dnd-kit/utilities'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { Document, Page } from 'react-pdf'

import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'
import type { PageModel } from '../types/models'

function SortableThumb({ page, index }: { page: PageModel; index: number }) {
  const state = useEditorStore((s) => s)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.pageId })
  const active = getActiveTab(state)

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`org-item ${page.selected ? 'selected' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
      onClick={(event) => state.selectPage(page.pageId, event.ctrlKey || event.metaKey)}
      {...attributes}
      {...listeners}
    >
      {active?.document.workingPdfBytes ? <Page pageNumber={index + 1} width={170} renderTextLayer={false} renderAnnotationLayer={false} /> : null}
      <span>Page {index + 1}</span>
    </button>
  )
}

export function OrganizerView() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)
  const editingLocked = active?.document.editingLocked ?? false
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  if (!active?.document.workingPdfBytes) {
    return <section className="organizer-empty">Open a PDF to use organizer mode.</section>
  }

  const pages = active.document.workingPageModels

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: activeDrag, over } = event
    if (!over || activeDrag.id === over.id) return
    const oldIndex = pages.findIndex((page) => page.pageId === activeDrag.id)
    const newIndex = pages.findIndex((page) => page.pageId === over.id)
    if (oldIndex >= 0 && newIndex >= 0) {
      state.reorderPages(oldIndex, newIndex)
    }
  }

  const previewOrder = arrayMove(pages.map((p) => p.pageId), 0, 0)

  return (
    <section className="organizer">
      <div className="organizer-actions">
        <button type="button" className="tool-btn" onClick={() => state.rotateSelectedPages(-90)} disabled={editingLocked}>
          Rotate Left
        </button>
        <button type="button" className="tool-btn" onClick={() => state.rotateSelectedPages(90)} disabled={editingLocked}>
          Rotate Right
        </button>
        <button type="button" className="tool-btn" onClick={() => state.deleteSelectedPages()} disabled={editingLocked}>
          Delete
        </button>
        <button type="button" className="tool-btn" onClick={() => state.insertBlankPage(state.currentPageIndex + 1)} disabled={editingLocked}>
          Insert Blank
        </button>
        <button type="button" className="tool-btn" onClick={() => state.exportSelectedPages()} disabled={editingLocked}>
          Export Selected
        </button>
        <button type="button" className="tool-btn" onClick={() => state.mergePdf('before')} disabled={editingLocked}>
          Merge Before
        </button>
        <button type="button" className="tool-btn" onClick={() => state.mergePdf('after')} disabled={editingLocked}>
          Merge After
        </button>
      </div>

      <Document file={{ data: active.document.workingPdfBytes }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={previewOrder} strategy={rectSortingStrategy}>
            <div className="organizer-grid">
              {pages.map((page, index) => (
                <SortableThumb key={page.pageId} page={page} index={index} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </Document>
    </section>
  )
}
