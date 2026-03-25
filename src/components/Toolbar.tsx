import { useMemo, useState } from 'react'
import {
  ChevronDown,
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
  Stamp,
  Sun,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

import { getActiveTab } from '../store/selectors'
import { useEditorStore } from '../store/useEditorStore'

type ToolbarMenu = 'search' | 'highlight' | 'text' | 'whiteout' | null

const HIGHLIGHT_PRESETS = ['#FFE066', '#FDE047', '#86EFAC', '#93C5FD', '#FCA5A5']

export function Toolbar() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)
  const editingLocked = active?.document.editingLocked ?? false
  const [menu, setMenu] = useState<ToolbarMenu>(null)
  const [searchInput, setSearchInput] = useState('')

  const selectedPageCount = useMemo(
    () => active?.document.workingPageModels.filter((page) => page.selected).length ?? 0,
    [active],
  )
  const matchCount = active?.document.searchState.matches.length ?? 0
  const activeMatch = active?.document.searchState.activeMatchIndex ?? -1
  const canSave = Boolean(active?.document.workingPdfBytes) && !editingLocked

  const toggleMenu = (next: ToolbarMenu) => {
    setMenu((current) => (current === next ? null : next))
  }

  const runSearch = () => {
    void state.runSearch(searchInput)
  }

  return (
    <header className="toolbar">
      <div className="tool-group">
        <button type="button" className="tool-btn" onClick={() => state.openPdf(true)}>
          <FolderOpen size={16} /> Open
        </button>
        <button type="button" className="tool-btn" onClick={() => state.save()} disabled={!canSave}>
          <Save size={16} /> Save
        </button>
        <button type="button" className="tool-btn" onClick={() => state.saveAs()} disabled={!canSave}>
          <FileDown size={16} /> Save As
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => state.printDocument()}
          disabled={!active?.document.workingPdfBytes}
        >
          <Printer size={16} /> Print
        </button>
      </div>

      <div className="tool-group">
        <button
          type="button"
          className={`tool-btn ${state.tool === 'highlight' ? 'active' : ''}`}
          onClick={() => state.setTool('highlight')}
          disabled={editingLocked}
        >
          <Highlighter size={16} /> Highlight
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Highlight options"
          onClick={() => toggleMenu('highlight')}
          disabled={editingLocked}
        >
          <ChevronDown size={14} />
        </button>

        <button
          type="button"
          className={`tool-btn ${state.tool === 'text' ? 'active' : ''}`}
          onClick={() => state.setTool('text')}
          disabled={editingLocked}
        >
          <Type size={16} /> Add Text
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Text tool options"
          onClick={() => toggleMenu('text')}
          disabled={editingLocked}
        >
          <ChevronDown size={14} />
        </button>

        <button
          type="button"
          className={`tool-btn ${state.tool === 'whiteout' ? 'active' : ''}`}
          onClick={() => state.setTool('whiteout')}
          disabled={editingLocked}
        >
          <Eraser size={16} /> Whiteout / Cover & Replace
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Whiteout options"
          onClick={() => toggleMenu('whiteout')}
          disabled={editingLocked}
        >
          <ChevronDown size={14} />
        </button>
        <button type="button" className="tool-btn" onClick={() => state.addStamp()} disabled={editingLocked}>
          <Stamp size={16} /> Stamp
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
        <button type="button" className="tool-btn" onClick={() => state.deleteSelectedPages()} disabled={editingLocked}>
          <Circle size={16} /> Delete Selected {selectedPageCount ? `(${selectedPageCount})` : ''}
        </button>
        <button type="button" className="tool-btn" onClick={() => state.mergeSelectedTabs()}>
          Merge Open Tabs
        </button>
        <button type="button" className="tool-btn" onClick={() => state.mergePdf('append')} disabled={editingLocked}>
          <FileInput size={16} /> Import PDF
        </button>
        <button type="button" className="tool-btn" onClick={() => state.exportSelectedPages()} disabled={editingLocked}>
          <FileOutput size={16} /> Export Selected
        </button>
      </div>

      <div className="tool-group">
        <button type="button" className="tool-btn" onClick={() => state.setFitMode('width')}>
          Fit Width
        </button>
        <button type="button" className="tool-btn" onClick={() => state.setFitMode('page')}>
          Fit Page
        </button>
        <button type="button" className="tool-btn" onClick={() => state.setFitMode('custom')}>
          100%
        </button>
      </div>

      <div className="tool-group right">
        <button type="button" className="icon-btn" title="Search" onClick={() => toggleMenu('search')}>
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
        <button
          type="button"
          className={`tool-btn ${state.organizerMode ? 'active' : ''}`}
          onClick={() => state.toggleOrganizerMode()}
        >
          Organizer
        </button>
        {editingLocked ? <span className="muted">View-only</span> : null}
        <button type="button" className="icon-btn" title="Theme" onClick={() => state.toggleTheme()}>
          {state.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>

      {menu ? (
        <div className="toolbar-popover panel">
          {menu === 'search' ? (
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

          {menu === 'highlight' ? (
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

          {menu === 'text' ? (
            <div className="stack">
              <h3>Text Tool Options</h3>
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

          {menu === 'whiteout' ? (
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
              <p className="muted">
                Whiteout/Cover & Replace overlays content visually and does not guarantee true source-text
                removal.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}
