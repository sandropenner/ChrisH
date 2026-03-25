import {
  Circle,
  Eraser,
  FileDown,
  FileInput,
  FileOutput,
  FolderOpen,
  Highlighter,
  Moon,
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

export function Toolbar() {
  const state = useEditorStore((s) => s)
  const active = getActiveTab(state)
  const editingLocked = active?.document.editingLocked ?? false

  return (
    <header className="toolbar">
      <div className="tool-group">
        <button type="button" className="tool-btn" onClick={() => state.openPdf(false)}>
          <FolderOpen size={16} /> Open
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => state.save()}
          disabled={!active?.document.workingPdfBytes || editingLocked}
        >
          <Save size={16} /> Save
        </button>
        <button
          type="button"
          className="tool-btn"
          onClick={() => state.saveAs()}
          disabled={!active?.document.workingPdfBytes || editingLocked}
        >
          <FileDown size={16} /> Save As
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
          className={`tool-btn ${state.tool === 'text' ? 'active' : ''}`}
          onClick={() => state.setTool('text')}
          disabled={editingLocked}
        >
          <Type size={16} /> Add Text
        </button>
        <button type="button" className="tool-btn" onClick={() => state.addStamp()} disabled={editingLocked}>
          <Stamp size={16} /> Stamp
        </button>
        <button
          type="button"
          className={`tool-btn ${state.tool === 'whiteout' ? 'active' : ''}`}
          onClick={() => state.setTool('whiteout')}
          disabled={editingLocked}
        >
          <Eraser size={16} /> Whiteout / Cover & Replace
        </button>
      </div>

      <div className="tool-group">
        <button type="button" className="icon-btn" title="Rotate Left" onClick={() => state.rotateSelectedPages(-90)} disabled={editingLocked}>
          <RotateCcw size={16} />
        </button>
        <button type="button" className="icon-btn" title="Rotate Right" onClick={() => state.rotateSelectedPages(90)} disabled={editingLocked}>
          <RotateCw size={16} />
        </button>
        <button type="button" className="tool-btn" onClick={() => state.deleteSelectedPages()} disabled={editingLocked}>
          <Circle size={16} /> Delete Pages
        </button>
        <button type="button" className="tool-btn" onClick={() => state.mergePdf('append')} disabled={editingLocked}>
          <FileInput size={16} /> Merge PDF
        </button>
        <button type="button" className="tool-btn" onClick={() => state.exportSelectedPages()} disabled={editingLocked}>
          <FileOutput size={16} /> Export Selected
        </button>
      </div>

      <div className="tool-group right">
        <button type="button" className="icon-btn" title="Search" onClick={() => state.toggleRightPanel()}>
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
        <button type="button" className={`tool-btn ${state.organizerMode ? 'active' : ''}`} onClick={() => state.toggleOrganizerMode()}>
          Organizer
        </button>
        {editingLocked ? <span className="muted">View-only</span> : null}
        <button type="button" className="icon-btn" title="Theme" onClick={() => state.toggleTheme()}>
          {state.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  )
}
