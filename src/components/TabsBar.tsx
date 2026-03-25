import { FilePlus2, Plus, X } from 'lucide-react'

import { useEditorStore } from '../store/useEditorStore'

export function TabsBar() {
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const selectedTabIds = useEditorStore((s) => s.selectedTabIds)
  const switchTab = useEditorStore((s) => s.switchTab)
  const toggleTabSelection = useEditorStore((s) => s.toggleTabSelection)
  const clearTabSelection = useEditorStore((s) => s.clearTabSelection)
  const closeTab = useEditorStore((s) => s.closeTab)
  const newTab = useEditorStore((s) => s.newTab)
  const openPdf = useEditorStore((s) => s.openPdf)

  return (
    <div className="tabs-bar">
      <div className="tabs-list">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-chip ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={(event) => {
              if (event.ctrlKey || event.metaKey) {
                toggleTabSelection(tab.id)
                return
              }
              switchTab(tab.id)
            }}
            type="button"
          >
            <span
              className={`tab-select-dot ${selectedTabIds.includes(tab.id) ? 'selected' : ''}`}
              title="Toggle tab selection for merge"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                toggleTabSelection(tab.id)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  toggleTabSelection(tab.id)
                }
              }}
            />
            <span>{tab.title}</span>
            {tab.document.dirty ? <span className="dirty-dot" title="Unsaved changes" /> : null}
            <span
              className="tab-close"
              onClick={(event) => {
                event.stopPropagation()
                closeTab(tab.id)
              }}
              role="button"
              tabIndex={0}
            >
              <X size={14} />
            </span>
          </button>
        ))}
      </div>

      <div className="tabs-actions">
        {selectedTabIds.length > 0 ? (
          <button type="button" className="tool-btn" onClick={() => clearTabSelection()} title="Clear selected tabs">
            Clear Tab Selection
          </button>
        ) : null}
        <button type="button" className="icon-btn" onClick={() => newTab()} title="New tab">
          <Plus size={16} />
        </button>
        <button type="button" className="icon-btn" onClick={() => openPdf(true)} title="Open in new tab">
          <FilePlus2 size={16} />
        </button>
      </div>
    </div>
  )
}
