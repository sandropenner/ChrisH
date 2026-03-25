import { useMemo, useState } from 'react'

import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'

export function SearchPanel() {
  const state = useEditorStore((s) => s)
  const [query, setQuery] = useState('')
  const active = useMemo(() => getActiveTab(state), [state])
  const matchCount = active?.document.searchState.matches.length ?? 0
  const activeMatch = active?.document.searchState.activeMatchIndex ?? -1

  return (
    <div className="panel search-panel">
      <h3>Search</h3>
      <div className="stack">
        <input
          type="text"
          placeholder="Search text in PDF"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="row">
          <button type="button" className="tool-btn" onClick={() => state.runSearch(query)}>
            Find
          </button>
          <button type="button" className="tool-btn" onClick={() => state.gotoPreviousMatch()}>
            Prev
          </button>
          <button type="button" className="tool-btn" onClick={() => state.gotoNextMatch()}>
            Next
          </button>
        </div>
        <p className="muted">
          Matches: {matchCount} {matchCount > 0 ? `| Active ${activeMatch + 1}` : ''}
        </p>
      </div>

      <h3>Recent Files</h3>
      <div className="stack recent-list">
        {state.recentFiles.length === 0 ? <p className="muted">No recent files yet.</p> : null}
        {state.recentFiles.map((path) => (
          <button key={path} type="button" className="recent-item" onClick={() => state.openRecent(path, true)}>
            {path}
          </button>
        ))}
      </div>
    </div>
  )
}
