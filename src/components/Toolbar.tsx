import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Circle,
  Eraser,
  FileDown,
  FileInput,
  FileOutput,
  FolderOpen,
  Highlighter,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  Sun,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'
import type { ToolMode } from '../types/models'

const HIGHLIGHT_PRESETS = ['#FFE066', '#FDE047', '#86EFAC', '#93C5FD', '#FCA5A5']
const TOOL_POPOVERS: ToolMode[] = ['highlight', 'text', 'whiteout']

export function Toolbar() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)
  const editingLocked = active?.document.editingLocked ?? false
  const [searchInput, setSearchInput] = useState('')
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const selectedPageCount = useMemo(
    () => active?.document.workingPageModels.filter((page) => page.selected).length ?? 0,
    [active],
  )
  const matchCount = active?.document.searchState.matches.length ?? 0
  const activeMatch = active?.document.searchState.activeMatchIndex ?? -1
  const canSave = Boolean(active?.document.workingPdfBytes) && !editingLocked

  useEffect(() => {
    if (!state.toolPopover) return

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (popoverRef.current?.contains(target)) return
      // Outside click closes the popover but keeps the active tool selected.
      state.closeToolPopover()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (TOOL_POPOVERS.includes(state.toolPopover as ToolMode) && state.tool !== 'select') {
        state.setTool('select')
      }
      state.closeToolPopover()
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [state])

  const runSearch = () => {
    void state.runSearch(searchInput)
  }

  const toggleTool = (tool: ToolMode) => {
    if (editingLocked) return
    if (state.tool === tool) {
      state.setTool('select')
      state.closeToolPopover()
      return
    }
    state.setTool(tool)
    state.setToolPopover(tool)
  }

  return (
    <header className="toolbar">
      <div className="tool-group">
        <button type="button" className="icon-btn" title="Open (Ctrl+O)" onClick={() => state.openPdf(true)}>
          <FolderOpen size={16} />
        </button>
        <button type="button" className="icon-btn" title="Save (Ctrl+S)" onClick={() => state.save()} disabled={!canSave}>
          <Save size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Save As (Ctrl+Shift+S)"
          onClick={() => state.saveAs()}
          disabled={!canSave}
        >
          <FileDown size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Print"
          onClick={() => state.printDocument()}
          disabled={!active?.document.workingPdfBytes}
        >
          <Printer size={16} />
        </button>
      </div>

      <div className="tool-group">
        <button
          type="button"
          className={`icon-btn ${state.tool === 'highlight' ? 'active' : ''}`}
          title="Highlight"
          onClick={() => toggleTool('highlight')}
          disabled={editingLocked}
        >
          <Highlighter size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn ${state.tool === 'text' ? 'active' : ''}`}
          title="Add Text"
          onClick={() => toggleTool('text')}
          disabled={editingLocked}
        >
          <Type size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn ${state.tool === 'whiteout' ? 'active' : ''}`}
          title="Whiteout / Cover & Replace"
          onClick={() => toggleTool('whiteout')}
          disabled={editingLocked}
        >
          <Eraser size={16} />
        </button>
      </div>

      <div className="tool-group">
        <button
          type="button"
          className="icon-btn"
          title="Rotate Left"
          onClick={() => state.rotateSelectedPages(-90)}
          disabled={editingLocked}
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Rotate Right"
          onClick={() => state.rotateSelectedPages(90)}
          disabled={editingLocked}
        >
          <RotateCw size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title={`Delete selected pages${selectedPageCount ? ` (${selectedPageCount})` : ''}`}
          onClick={() => state.deleteSelectedPages()}
          disabled={editingLocked}
        >
          <Trash2 size={16} />
        </button>
        <button type="button" className="tool-btn compact-label" onClick={() => state.mergeSelectedTabs()}>
          Merge Open Tabs
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Import PDF"
          onClick={() => state.mergePdf('append')}
          disabled={editingLocked}
        >
          <FileInput size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Export selected pages"
          onClick={() => state.exportSelectedPages()}
          disabled={editingLocked}
        >
          <FileOutput size={16} />
        </button>
      </div>

      <div className="tool-group">
        <button type="button" className="tool-btn compact-label" onClick={() => state.setFitMode('width')}>
          Fit Width
        </button>
        <button type="button" className="tool-btn compact-label" onClick={() => state.setFitMode('page')}>
          Fit Page
        </button>
        <button type="button" className="icon-btn" title="Actual size" onClick={() => state.setFitMode('custom')}>
          100%
        </button>
      </div>

      <div className="tool-group right">
        <button
          type="button"
          className={`icon-btn ${state.toolPopover === 'search' ? 'active' : ''}`}
          title="Search"
          onClick={() =>
            state.setToolPopover(state.toolPopover === 'search' ? null : 'search')
          }
        >
          <Search size={16} />
        </button>
        <button type="button" className="icon-btn" title="Undo" onClick={() => state.undo()}>
          <Undo2 size={16} />
        </button>
        <button type="button" className="icon-btn" title="Redo" onClick={() => state.redo()}>
          <Redo2 size={16} />
        </button>
        <button type="button" className="icon-btn" title="Zoom Out" onClick={() => state.zoomOut()}>
          <ZoomOut size={16} />
        </button>
        <span className="zoom-readout">{Math.round(state.zoom * 100)}%</span>
        <button type="button" className="icon-btn" title="Zoom In" onClick={() => state.zoomIn()}>
          <ZoomIn size={16} />
        </button>
        <button type="button" className="icon-btn" title="Toggle thumbnails" onClick={() => state.toggleLeftSidebar()}>
          {state.leftSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <button type="button" className={`icon-btn ${state.organizerMode ? 'active' : ''}`} title="Organizer mode" onClick={() => state.toggleOrganizerMode()}>
          <Circle size={16} />
        </button>
        {editingLocked ? <span className="muted">View-only</span> : null}
        <button type="button" className="icon-btn" title="Theme" onClick={() => state.toggleTheme()}>
          {state.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {state.toolPopover ? (
        <div className="toolbar-popover panel" ref={popoverRef}>
          {state.toolPopover === 'search' ? (
            <div className="stack">
              <h3>Search</h3>
              <input
                type="text"
                placeholder="Search text in PDF"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    runSearch()
                  }
                }}
              />
              <div className="row">
                <button type="button" className="tool-btn" onClick={runSearch}>
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
              <div className="stack recent-list">
                <p className="muted">Recent Files</p>
                {state.recentFiles.length === 0 ? <p className="muted">No recent files yet.</p> : null}
                {state.recentFiles.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className="recent-item"
                    onClick={() => {
                      void state.openRecent(path, true)
                    }}
                  >
                    {path}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {state.toolPopover === 'highlight' ? (
            <div className="stack">
              <h3>Highlight Options</h3>
              <div className="row">
                {HIGHLIGHT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="color-chip"
                    style={{ background: preset }}
                    title={preset}
                    onClick={() => state.setHighlightToolSettings({ color: preset })}
                  />
                ))}
                <input
                  type="color"
                  value={state.toolSettings.highlight.color}
                  onChange={(event) => state.setHighlightToolSettings({ color: event.target.value })}
                />
              </div>
              <label>
                Opacity ({state.toolSettings.highlight.opacity.toFixed(2)})
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={state.toolSettings.highlight.opacity}
                  onChange={(event) =>
                    state.setHighlightToolSettings({ opacity: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Thickness ({state.toolSettings.highlight.thickness.toFixed(2)})
                <input
                  type="range"
                  min={0.5}
                  max={2.2}
                  step={0.1}
                  value={state.toolSettings.highlight.thickness}
                  onChange={(event) =>
                    state.setHighlightToolSettings({ thickness: Number(event.target.value) })
                  }
                />
              </label>
            </div>
          ) : null}

          {state.toolPopover === 'text' ? (
            <div className="stack">
              <h3>Add Text Options</h3>
              <label>
                Default Text
                <input
                  type="text"
                  value={state.toolSettings.text.defaultText}
                  onChange={(event) => state.setTextToolSettings({ defaultText: event.target.value })}
                />
              </label>
              <label>
                Font Size
                <input
                  type="number"
                  min={8}
                  max={96}
                  value={state.toolSettings.text.fontSize}
                  onChange={(event) => state.setTextToolSettings({ fontSize: Number(event.target.value) })}
                />
              </label>
              <label>
                Text Color
                <input
                  type="color"
                  value={state.toolSettings.text.color}
                  onChange={(event) => state.setTextToolSettings({ color: event.target.value })}
                />
              </label>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={state.toolSettings.text.bold}
                  onChange={(event) => state.setTextToolSettings({ bold: event.target.checked })}
                />
                Bold
              </label>
            </div>
          ) : null}

          {state.toolPopover === 'whiteout' ? (
            <div className="stack">
              <h3>Whiteout / Replace Options</h3>
              <label>
                Fill Color
                <input
                  type="color"
                  value={state.toolSettings.whiteout.fillColor}
                  onChange={(event) =>
                    state.setWhiteoutToolSettings({ fillColor: event.target.value })
                  }
                />
              </label>
              <label>
                Replacement Text Color
                <input
                  type="color"
                  value={state.toolSettings.whiteout.replacementColor}
                  onChange={(event) =>
                    state.setWhiteoutToolSettings({ replacementColor: event.target.value })
                  }
                />
              </label>
              <label>
                Replacement Font Size
                <input
                  type="number"
                  min={8}
                  max={96}
                  value={state.toolSettings.whiteout.replacementFontSize}
                  onChange={(event) =>
                    state.setWhiteoutToolSettings({
                      replacementFontSize: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Rectangle Padding ({state.toolSettings.whiteout.padding.toFixed(3)})
                <input
                  type="range"
                  min={0}
                  max={0.03}
                  step={0.001}
                  value={state.toolSettings.whiteout.padding}
                  onChange={(event) =>
                    state.setWhiteoutToolSettings({ padding: Number(event.target.value) })
                  }
                />
              </label>
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}
