import type { PDFDocumentProxy } from 'pdfjs-dist'

export type ToolMode = 'select' | 'highlight' | 'text' | 'whiteout'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export interface RectNorm {
  x: number
  y: number
  width: number
  height: number
}

export interface AnnotationBase {
  id: string
  pageId: string
  createdAt: number
  updatedAt: number
}

export interface HighlightAnnotation extends AnnotationBase {
  type: 'highlight'
  rect: RectNorm
  color: string
  opacity: number
}

export interface TextOverlayAnnotation extends AnnotationBase {
  type: 'textOverlay'
  rect: RectNorm
  text: string
  color: string
  fontSize: number
  bold: boolean
}

export interface WhiteoutRectAnnotation extends AnnotationBase {
  type: 'whiteoutRect'
  rect: RectNorm
  fill: string
}

export interface ReplacementTextAnnotation extends AnnotationBase {
  type: 'replacementText'
  rect: RectNorm
  text: string
  color: string
  fontSize: number
  bold: boolean
}

export type Annotation =
  | HighlightAnnotation
  | TextOverlayAnnotation
  | WhiteoutRectAnnotation
  | ReplacementTextAnnotation

export interface PageModel {
  pageId: string
  sourcePageIndex: number
  currentOrderIndex: number
  rotation: number
  selected: boolean
  deleted: boolean
  inserted: boolean
}

export interface SearchMatch {
  id: string
  pageIndex: number
  pageId: string
  rect: RectNorm
  preview: string
}

export interface SearchState {
  query: string
  matches: SearchMatch[]
  activeMatchIndex: number
}

export interface HighlightToolSettings {
  color: string
  opacity: number
  thickness: number
}

export interface TextToolSettings {
  color: string
  fontSize: number
  bold: boolean
  defaultText: string
}

export interface WhiteoutToolSettings {
  fillColor: string
  replacementColor: string
  replacementFontSize: number
  padding: number
}

export interface ToolSettings {
  highlight: HighlightToolSettings
  text: TextToolSettings
  whiteout: WhiteoutToolSettings
}

export interface HistoryCommand {
  label: string
  before: EditorSnapshot
  after: EditorSnapshot
  createdAt: number
}

export interface HistoryState {
  undoStack: HistoryCommand[]
  redoStack: HistoryCommand[]
}

export interface EditorSnapshot {
  workingPdfBytes: Uint8Array
  workingPageModels: PageModel[]
  annotationsByPage: Record<string, Annotation[]>
  currentPageIndex: number
}

export interface WorkingDocument {
  id: string
  sourcePath: string | null
  sourceFileName: string
  sourceBytes: Uint8Array | null
  loadedPdfProxy: PDFDocumentProxy | null
  workingPdfBytes: Uint8Array | null
  workingPageModels: PageModel[]
  annotationsByPage: Record<string, Annotation[]>
  editingLocked: boolean
  editingLockReason: string | null
  dirty: boolean
  saveStatus: SaveStatus
  saveError: string | null
  searchState: SearchState
  history: HistoryState
}

export interface DocumentTab {
  id: string
  title: string
  document: WorkingDocument
}

export type FitMode = 'custom' | 'width' | 'page'

export type ThemeMode = 'light' | 'dark'
