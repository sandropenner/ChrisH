import { useMemo } from 'react'

import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'

export function InspectorPanel() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)
  const editingLocked = active?.document.editingLocked ?? false

  const selectedAnnotation = useMemo(() => {
    if (!active || !state.selectedAnnotationId) return null
    for (const [pageId, list] of Object.entries(active.document.annotationsByPage)) {
      const found = list.find((item) => item.id === state.selectedAnnotationId)
      if (found) {
        return { pageId, annotation: found }
      }
    }
    return null
  }, [active, state.selectedAnnotationId])

  const annotationEntries = useMemo(() => {
    if (!active) return []
    return active.document.workingPageModels.flatMap((page, index) =>
      (active.document.annotationsByPage[page.pageId] ?? []).map((annotation) => ({
        pageId: page.pageId,
        pageIndex: index,
        annotation,
      })),
    )
  }, [active])

  return (
    <aside className="panel inspector-panel">
      <h3>Inspector</h3>
      <p className="muted">
        Whiteout/Cover & Replace overlays content visually. This is not guaranteed true underlying text deletion.
      </p>

      {!selectedAnnotation ? <p className="muted">Select a text annotation to edit.</p> : null}

      {selectedAnnotation && (selectedAnnotation.annotation.type === 'textOverlay' || selectedAnnotation.annotation.type === 'replacementText') ? (
        <div className="stack">
          <label>
            Text
            <textarea
              value={selectedAnnotation.annotation.text}
              disabled={editingLocked}
              onChange={(event) =>
                state.updateAnnotation(selectedAnnotation.pageId, selectedAnnotation.annotation.id, {
                  text: event.target.value,
                })
              }
            />
          </label>

          <label>
            Font Size
            <input
              type="number"
              min={8}
              max={96}
              disabled={editingLocked}
              value={selectedAnnotation.annotation.fontSize}
              onChange={(event) =>
                state.updateAnnotation(selectedAnnotation.pageId, selectedAnnotation.annotation.id, {
                  fontSize: Number(event.target.value),
                })
              }
            />
          </label>

          <label>
            Color
            <input
              type="color"
              value={selectedAnnotation.annotation.color}
              disabled={editingLocked}
              onChange={(event) =>
                state.updateAnnotation(selectedAnnotation.pageId, selectedAnnotation.annotation.id, {
                  color: event.target.value,
                })
              }
            />
          </label>

          <label className="inline">
              <input
                type="checkbox"
                checked={selectedAnnotation.annotation.bold}
                disabled={editingLocked}
                onChange={(event) =>
                state.updateAnnotation(selectedAnnotation.pageId, selectedAnnotation.annotation.id, {
                  bold: event.target.checked,
                })
              }
            />
            Bold
          </label>

            <button
              type="button"
              className="tool-btn danger"
              disabled={editingLocked}
              onClick={() => state.removeAnnotation(selectedAnnotation.pageId, selectedAnnotation.annotation.id)}
            >
            Remove Annotation
          </button>
        </div>
      ) : null}

      <h3>Display</h3>
      <div className="row">
        <button type="button" className="tool-btn" onClick={() => state.setFitMode('width')}>
          Fit Width
        </button>
        <button type="button" className="tool-btn" onClick={() => state.setFitMode('page')}>
          Fit Page
        </button>
        <button type="button" className="tool-btn" onClick={() => state.setFitMode('custom')}>
          Custom
        </button>
      </div>

      <h3>Page Labels</h3>
      <p className="muted">Page {state.currentPageIndex + 1} of {active?.document.workingPageModels.length ?? 0}</p>

      <h3>Comments / Annotations</h3>
      <div className="stack recent-list">
        {annotationEntries.length === 0 ? <p className="muted">No annotations on this document yet.</p> : null}
        {annotationEntries.map((entry) => (
          <button
            type="button"
            className="recent-item"
            key={entry.annotation.id}
            onClick={() => {
              state.setCurrentPageIndex(entry.pageIndex)
              state.selectAnnotation(entry.annotation.id)
            }}
          >
            Page {entry.pageIndex + 1} | {entry.annotation.type}
          </button>
        ))}
      </div>
    </aside>
  )
}
