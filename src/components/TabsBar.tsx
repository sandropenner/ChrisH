import { FilePlus2, Plus, X } from 'lucide-react'

import { useEditorStore } from '../store/useEditorStore'

export function TabsBar() {
  const tabs = useEditorStore((s) => s.tabs)
  const activeTabId = useEditorStore((s) => s.activeTabId)
  const switchTab = useEditorStore((s) => s.switchTab)
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
            onClick={() => switchTab(tab.id)}
            type="button"
          >
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
