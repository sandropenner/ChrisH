import { useMemo } from 'react'

import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'

export function StatusBar() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)

  const saveText = useMemo(() => {
    if (!active) return 'No document'
    if (active.document.editingLocked) {
      return active.document.editingLockReason ?? 'View-only mode'
    }
    if (active.document.saveStatus === 'saving') return 'Saving...'
    if (active.document.saveStatus === 'error') return `Save error: ${active.document.saveError ?? 'Unknown error'}`
    if (active.document.dirty) return 'Unsaved changes'
    return 'All changes saved'
  }, [active])

  return (
    <footer className="status-bar">
      <span>
        Page {active ? Math.max(1, state.currentPageIndex + 1) : 0} / {active?.document.workingPageModels.length ?? 0}
      </span>
      <span>{Math.round(state.zoom * 100)}%</span>
      <span>{saveText}</span>
      <span>{state.statusMessage ?? ''}</span>
    </footer>
  )
}
