import { create } from 'zustand'
import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { buildSnapshot, cloneSnapshot, createHistoryCommand } from '../lib/commands/history'
import { createInitialPageModels } from '../lib/pdf/pageOps'
import { searchPdf } from '../lib/pdf/search'
import {
  listRecentFiles,
  pickOpenPdf,
  readPdfBytes,
  storeRecentFile,
} from '../lib/tauri/commands'
import { createDocumentPersistenceActions } from './actions/documentPersistence'
import { createPageActions } from './actions/pageActions'
import type {
  Annotation,
  DocumentTab,
  EditorSnapshot,
  FitMode,
  HighlightToolSettings,
  PageModel,
  TextToolSettings,
  ThemeMode,
  ToolSettings,
  ToolMode,
  WhiteoutToolSettings,
  WorkingDocument,
} from '../types/models'

const THEME_KEY = 'chris-pdf-theme'

const DEFAULT_HIGHLIGHT_SETTINGS: HighlightToolSettings = {
  color: '#FFE066',
  opacity: 0.45,
  thickness: 1,
}

const DEFAULT_TEXT_SETTINGS: TextToolSettings = {
  color: '#111827',
  fontSize: 14,
  bold: false,
  defaultText: 'Text',
}

const DEFAULT_WHITEOUT_SETTINGS: WhiteoutToolSettings = {
  fillColor: '#FFFFFF',
  replacementColor: '#111827',
  replacementFontSize: 14,
  padding: 0,
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function expandRect(
  rect: { x: number; y: number; width: number; height: number },
  padding: number,
): { x: number; y: number; width: number; height: number } {
  const safePadding = Math.max(0, Math.min(0.1, padding))
  const x = clamp01(rect.x - safePadding)
  const y = clamp01(rect.y - safePadding)
  const right = clamp01(rect.x + rect.width + safePadding)
  const bottom = clamp01(rect.y + rect.height + safePadding)
  return {
    x,
    y,
    width: Math.max(0.002, right - x),
    height: Math.max(0.002, bottom - y),
  }
}

function emptyDocument(title = 'Untitled.pdf'): WorkingDocument {
  return {
    id: crypto.randomUUID(),
    sourcePath: null,
    sourceFileName: title,
    sourceBytes: null,
    loadedPdfProxy: null,
    workingPdfBytes: null,
    workingPageModels: [],
    annotationsByPage: {},
    editingLocked: false,
    editingLockReason: null,
    dirty: false,
    saveStatus: 'idle',
    saveError: null,
    searchState: { query: '', matches: [], activeMatchIndex: -1 },
    history: { undoStack: [], redoStack: [] },
  }
}

function tabFromDoc(doc: WorkingDocument): DocumentTab {
  return { id: doc.id, title: doc.sourceFileName, document: doc }
}

function fileName(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || 'document.pdf'
}

function clonePages(pages: PageModel[]): PageModel[] {
  return pages.map((page) => ({ ...page }))
}

function cloneAnnots(ann: Record<string, Annotation[]>): Record<string, Annotation[]> {
  return Object.fromEntries(
    Object.entries(ann).map(([k, v]) => [k, v.map((item) => ({ ...item, rect: { ...item.rect } }))]),
  )
}

function normalizePages(pages: PageModel[]): PageModel[] {
  return pages.map((page, index) => ({ ...page, currentOrderIndex: index }))
}

function activeIndex(tabs: DocumentTab[], activeTabId: string | null): number {
  if (!activeTabId) return -1
  return tabs.findIndex((tab) => tab.id === activeTabId)
}

function applySnapshot(doc: WorkingDocument, snapshot: EditorSnapshot): WorkingDocument {
  return {
    ...doc,
    loadedPdfProxy: null,
    workingPdfBytes: new Uint8Array(snapshot.workingPdfBytes),
    workingPageModels: clonePages(snapshot.workingPageModels),
    annotationsByPage: cloneAnnots(snapshot.annotationsByPage),
    editingLocked: doc.editingLocked,
    editingLockReason: doc.editingLockReason,
    dirty: true,
    saveStatus: 'idle',
    saveError: null,
  }
}

function setTheme(theme: ThemeMode): void {
  localStorage.setItem(THEME_KEY, theme)
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function logAndMessage(context: string, error: unknown, fallback: string): string {
  console.error(`[${context}]`, error)
  const message = errorText(error)
  if (!message || message === '[object Object]') return fallback
  return `${fallback}: ${message}`
}

function pdfLibEditLockReason(error: unknown): string {
  const message = errorText(error).toLowerCase()
  if (message.includes('encrypted') || message.includes('password')) {
    return 'This PDF can be viewed, but editing/saving is unavailable because the file is encrypted.'
  }
  return 'This PDF can be viewed, but editing/saving is unavailable because the file format is not supported by the edit pipeline.'
}

async function detectEditingSupport(bytes: Uint8Array): Promise<{ editingLocked: boolean; reason: string | null }> {
  try {
    await PDFDocument.load(bytes)
    return { editingLocked: false, reason: null }
  } catch (error) {
    return {
      editingLocked: true,
      reason: pdfLibEditLockReason(error),
    }
  }
}

async function loadDoc(path: string): Promise<WorkingDocument> {
  const bytes = await readPdfBytes(path)
  return {
    ...emptyDocument(fileName(path)),
    id: crypto.randomUUID(),
    sourcePath: path,
    sourceFileName: fileName(path),
    sourceBytes: new Uint8Array(bytes),
    workingPdfBytes: new Uint8Array(bytes),
    workingPageModels: [],
  }
}

type Store = {
  tabs: DocumentTab[]
  activeTabId: string | null
  currentPageIndex: number
  zoom: number
  fitMode: FitMode
  organizerMode: boolean
  tool: ToolMode
  toolSettings: ToolSettings
  theme: ThemeMode
  selectedAnnotationId: string | null
  selectedTabIds: string[]
  toolPopover: ToolMode | 'search' | null
  statusMessage: string | null
  leftSidebarCollapsed: boolean
  recentFiles: string[]

  setStatusMessage: (message: string | null) => void
  initialize: () => Promise<void>
  openPdf: (newTab?: boolean) => Promise<void>
  openRecent: (path: string, newTab?: boolean) => Promise<void>
  setLoadedPdfProxy: (proxy: PDFDocumentProxy) => void
  setCurrentPageIndex: (index: number) => void
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  setFitMode: (mode: FitMode) => void
  setTool: (tool: ToolMode) => void
  setToolPopover: (popover: ToolMode | 'search' | null) => void
  closeToolPopover: () => void
  setHighlightToolSettings: (patch: Partial<HighlightToolSettings>) => void
  setTextToolSettings: (patch: Partial<TextToolSettings>) => void
  setWhiteoutToolSettings: (patch: Partial<WhiteoutToolSettings>) => void
  toggleTheme: () => void
  toggleOrganizerMode: () => void
  toggleLeftSidebar: () => void
  runSearch: (query: string) => Promise<void>
  gotoNextMatch: () => void
  gotoPreviousMatch: () => void
  addHighlights: (pageId: string, rects: Array<{ x: number; y: number; width: number; height: number }>) => void
  addTextOverlay: (pageId: string, rect: { x: number; y: number; width: number; height: number }) => void
  addWhiteout: (pageId: string, rect: { x: number; y: number; width: number; height: number }, replacement?: string) => void
  updateAnnotation: (pageId: string, annotationId: string, patch: Partial<Annotation>) => void
  removeAnnotation: (pageId: string, annotationId: string) => void
  selectAnnotation: (id: string | null) => void
  selectPage: (pageId: string, multi: boolean) => void
  clearPageSelection: () => void
  reorderPages: (from: number, to: number) => Promise<void>
  rotateSelectedPages: (delta: number) => Promise<void>
  deleteSelectedPages: () => Promise<void>
  insertBlankPage: (index: number) => Promise<void>
  mergePdf: (mode: 'append' | 'before' | 'after') => Promise<void>
  mergeSelectedTabs: () => Promise<void>
  exportSelectedPages: () => Promise<void>
  printDocument: () => Promise<void>
  save: () => Promise<void>
  saveAs: () => Promise<void>
  undo: () => void
  redo: () => void
  newTab: () => void
  switchTab: (id: string) => void
  toggleTabSelection: (id: string) => void
  clearTabSelection: () => void
  closeTab: (id: string) => void
}

export type EditorStore = Store

function commit(
  doc: WorkingDocument,
  label: string,
  before: EditorSnapshot,
  after: EditorSnapshot,
): WorkingDocument {
  // TODO: optimize history snapshots to reduce memory pressure for large PDFs.
  const command = createHistoryCommand(label, before, after)
  return {
    ...doc,
    dirty: true,
    saveStatus: 'idle',
    saveError: null,
    history: {
      undoStack: [...doc.history.undoStack, command],
      redoStack: [],
    },
  }
}

function ensureEditable(setter: (value: Partial<Store>) => void, doc: WorkingDocument): boolean {
  if (!doc.editingLocked) return true
  setter({
    statusMessage:
      doc.editingLockReason ??
      'This PDF can be viewed, but editing/saving is unavailable because the file is encrypted.',
  })
  return false
}

export const useEditorStore = create<Store>((set, get) => {
  const pageActions = createPageActions({
    set,
    get,
    activeIndex,
    ensureEditable,
    buildSnapshot,
    commit,
    normalizePages,
    cloneAnnots,
    emptyDocument,
    tabFromDoc,
  })

  const documentPersistenceActions = createDocumentPersistenceActions({
    set,
    get,
    activeIndex,
    fileName,
  })

  return ({
  tabs: [],
  activeTabId: null,
  currentPageIndex: 0,
  zoom: 1,
  fitMode: 'custom',
  organizerMode: false,
  tool: 'select',
  toolSettings: {
    highlight: { ...DEFAULT_HIGHLIGHT_SETTINGS },
    text: { ...DEFAULT_TEXT_SETTINGS },
    whiteout: { ...DEFAULT_WHITEOUT_SETTINGS },
  },
  theme: 'light',
  selectedAnnotationId: null,
  selectedTabIds: [],
  toolPopover: null,
  statusMessage: null,
  leftSidebarCollapsed: false,
  recentFiles: [],

  setStatusMessage: (message) => set({ statusMessage: message }),

  initialize: async () => {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') {
      set({ theme: stored })
      setTheme(stored)
    } else {
      setTheme('light')
    }
    const current = get()
    if (!current.activeTabId && current.tabs.length > 0) {
      set({ activeTabId: current.tabs[0].id })
    }
    try {
      set({ recentFiles: await listRecentFiles() })
    } catch {
      set({ recentFiles: [] })
    }
  },

  openPdf: async (newTab = true) => {
    const path = await pickOpenPdf()
    if (!path) return
    await get().openRecent(path, newTab)
  },

  openRecent: async (path: string, newTab = true) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx >= 0 && !newTab && state.tabs[idx].document.dirty) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to close without saving?')) return
    }
    try {
      const doc = await loadDoc(path)
      let targetTabId = doc.id
      if (newTab || idx === -1) {
        set((s) => ({
          tabs: [...s.tabs, tabFromDoc(doc)],
          activeTabId: doc.id,
          currentPageIndex: 0,
          tool: 'select',
          toolPopover: null,
          selectedAnnotationId: null,
          selectedTabIds: [],
          zoom: 1,
          fitMode: 'custom',
          statusMessage: `Opened ${doc.sourceFileName}`,
        }))
      } else {
        targetTabId = state.tabs[idx].id
        set((s) => {
          const tabs = [...s.tabs]
          tabs[idx] = { id: tabs[idx].id, title: doc.sourceFileName, document: doc }
          return {
            tabs,
            currentPageIndex: 0,
            tool: 'select',
            toolPopover: null,
            selectedAnnotationId: null,
            selectedTabIds: [],
            zoom: 1,
            fitMode: 'custom',
            statusMessage: `Opened ${doc.sourceFileName}`,
          }
        })
      }
      await storeRecentFile(path)
      set({ recentFiles: await listRecentFiles() })

      if (doc.workingPdfBytes) {
        void detectEditingSupport(doc.workingPdfBytes)
          .then((support) => {
            set((current) => {
              const targetIndex = activeIndex(current.tabs, targetTabId)
              if (targetIndex === -1) return current
              const tabs = [...current.tabs]
              const currentDoc = tabs[targetIndex].document
              tabs[targetIndex] = {
                ...tabs[targetIndex],
                document: {
                  ...currentDoc,
                  editingLocked: support.editingLocked,
                  editingLockReason: support.reason,
                },
              }
              return {
                tabs,
                statusMessage: support.editingLocked ? support.reason : current.statusMessage,
              }
            })
          })
          .catch((error) => {
            console.error('[openRecent:editing-support-check]', error)
          })
      }
    } catch (error) {
      const message = errorText(error).toLowerCase()
      if (message.includes('encrypted') || message.includes('password')) {
        console.error('[openRecent:encrypted]', error)
        set({
          statusMessage:
            'This PDF appears to be password protected. If PDF.js can render it, it will open in view-only mode.',
        })
        return
      }
      if (message.includes('does not look like a valid pdf') || message.includes('not a .pdf')) {
        set({ statusMessage: 'Invalid or corrupt PDF. Please choose a different file.' })
        console.error('[openRecent:invalid-pdf]', error)
        return
      }
      set({ statusMessage: logAndMessage('openRecent', error, 'Failed to open PDF') })
    }
  },

  setLoadedPdfProxy: (proxy) => {
    set((state) => {
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return state
      const doc = state.tabs[idx].document
      let workingPageModels = doc.workingPageModels
      let annotationsByPage = doc.annotationsByPage

      if (workingPageModels.length === 0) {
        workingPageModels = createInitialPageModels(proxy.numPages)
      } else if (workingPageModels.length !== proxy.numPages) {
        // If the runtime PDF page count changed unexpectedly, reset to a consistent model.
        workingPageModels = createInitialPageModels(proxy.numPages)
        annotationsByPage = {}
        console.error('[setLoadedPdfProxy] page model count mismatch. Resetting page models.', {
          previousCount: doc.workingPageModels.length,
          runtimeCount: proxy.numPages,
        })
      }

      const tabs = [...state.tabs]
      tabs[idx] = {
        ...tabs[idx],
        document: {
          ...doc,
          loadedPdfProxy: proxy,
          workingPageModels,
          annotationsByPage,
        },
      }

      return {
        tabs,
        currentPageIndex: Math.min(state.currentPageIndex, Math.max(0, workingPageModels.length - 1)),
      }
    })
  },

  setCurrentPageIndex: (index) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const max = Math.max(0, state.tabs[idx].document.workingPageModels.length - 1)
    set({ currentPageIndex: Math.max(0, Math.min(index, max)) })
  },

  setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)), fitMode: 'custom' }),
  zoomIn: () => set((state) => ({ zoom: Math.min(4, Number((state.zoom + 0.1).toFixed(2))), fitMode: 'custom' })),
  zoomOut: () => set((state) => ({ zoom: Math.max(0.25, Number((state.zoom - 0.1).toFixed(2))), fitMode: 'custom' })),
  setFitMode: (mode) => set({ fitMode: mode }),
  setTool: (tool) => set({ tool, toolPopover: tool === 'select' ? null : get().toolPopover }),
  setToolPopover: (popover) => set({ toolPopover: popover }),
  closeToolPopover: () => set({ toolPopover: null }),
  setHighlightToolSettings: (patch) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        highlight: { ...state.toolSettings.highlight, ...patch },
      },
    })),
  setTextToolSettings: (patch) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        text: { ...state.toolSettings.text, ...patch },
      },
    })),
  setWhiteoutToolSettings: (patch) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        whiteout: { ...state.toolSettings.whiteout, ...patch },
      },
    })),
  toggleTheme: () => set((state) => { const theme = state.theme === 'dark' ? 'light' : 'dark'; setTheme(theme); return { theme } }),
  toggleOrganizerMode: () => set((state) => ({ organizerMode: !state.organizerMode })),
  toggleLeftSidebar: () => set((state) => ({ leftSidebarCollapsed: !state.leftSidebarCollapsed })),

  runSearch: async (query) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!doc.loadedPdfProxy) return
    const matches = await searchPdf(doc.loadedPdfProxy, doc.workingPageModels, query)
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: { ...doc, searchState: { query, matches, activeMatchIndex: matches.length ? 0 : -1 } } }
    set({
      tabs,
      currentPageIndex: matches.length ? matches[0].pageIndex : state.currentPageIndex,
      statusMessage: matches.length ? `${matches.length} matches found` : 'No matches found',
    })
  },

  gotoNextMatch: () => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!doc.searchState.matches.length) return
    const next = (doc.searchState.activeMatchIndex + 1) % doc.searchState.matches.length
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: { ...doc, searchState: { ...doc.searchState, activeMatchIndex: next } } }
    set({ tabs, currentPageIndex: doc.searchState.matches[next].pageIndex })
  },

  gotoPreviousMatch: () => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!doc.searchState.matches.length) return
    const next = (doc.searchState.activeMatchIndex - 1 + doc.searchState.matches.length) % doc.searchState.matches.length
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: { ...doc, searchState: { ...doc.searchState, activeMatchIndex: next } } }
    set({ tabs, currentPageIndex: doc.searchState.matches[next].pageIndex })
  },

  addHighlights: (pageId, rects) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1 || !rects.length) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    const settings = state.toolSettings.highlight
    const thickness = Math.max(0.3, Math.min(2.2, settings.thickness))
    const before = buildSnapshot(doc, state.currentPageIndex)
    const ann = cloneAnnots(doc.annotationsByPage)
    const now = Date.now()
    ann[pageId] = [
      ...(ann[pageId] ?? []),
      ...rects.map((rect) => {
        const centerY = rect.y + rect.height / 2
        const adjustedHeight = clamp01(rect.height * thickness)
        const adjustedY = clamp01(centerY - adjustedHeight / 2)
        return {
          id: crypto.randomUUID(),
          pageId,
          type: 'highlight' as const,
          rect: {
            x: clamp01(rect.x),
            y: adjustedY,
            width: clamp01(rect.width),
            height: Math.max(0.002, adjustedHeight),
          },
          color: settings.color,
          opacity: Math.max(0.1, Math.min(1, settings.opacity)),
          createdAt: now,
          updatedAt: now,
        }
      }),
    ]
    let nextDoc: WorkingDocument = { ...doc, annotationsByPage: ann }
    nextDoc = commit(nextDoc, 'Add highlight', before, buildSnapshot(nextDoc, state.currentPageIndex))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: nextDoc }
    set({ tabs, toolPopover: null, statusMessage: 'Highlight added' })
  },

  addTextOverlay: (pageId, rect) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    const settings = state.toolSettings.text
    const before = buildSnapshot(doc, state.currentPageIndex)
    const ann = cloneAnnots(doc.annotationsByPage)
    const now = Date.now()
    const entry: Annotation = {
      id: crypto.randomUUID(),
      pageId,
      type: 'textOverlay',
      rect,
      text: settings.defaultText || 'Text',
      color: settings.color,
      fontSize: Math.max(8, Math.min(96, settings.fontSize)),
      bold: settings.bold,
      createdAt: now,
      updatedAt: now,
    }
    ann[pageId] = [...(ann[pageId] ?? []), entry]
    let nextDoc: WorkingDocument = { ...doc, annotationsByPage: ann }
    nextDoc = commit(nextDoc, 'Add text overlay', before, buildSnapshot(nextDoc, state.currentPageIndex))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: nextDoc }
    set({ tabs, toolPopover: null, selectedAnnotationId: entry.id, statusMessage: 'Text overlay added' })
  },

  addWhiteout: (pageId, rect, replacement) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    const settings = state.toolSettings.whiteout
    const paddedRect = expandRect(rect, settings.padding)
    const before = buildSnapshot(doc, state.currentPageIndex)
    const ann = cloneAnnots(doc.annotationsByPage)
    const now = Date.now()
    const next: Annotation[] = [...(ann[pageId] ?? [])]
    next.push({
      id: crypto.randomUUID(),
      pageId,
      type: 'whiteoutRect',
      rect: paddedRect,
      fill: settings.fillColor,
      createdAt: now,
      updatedAt: now,
    })
    if (replacement && replacement.trim()) {
      next.push({
        id: crypto.randomUUID(),
        pageId,
        type: 'replacementText',
        rect: paddedRect,
        text: replacement,
        color: settings.replacementColor,
        fontSize: Math.max(8, Math.min(96, settings.replacementFontSize)),
        bold: false,
        createdAt: now,
        updatedAt: now,
      })
    }
    ann[pageId] = next
    let nextDoc: WorkingDocument = { ...doc, annotationsByPage: ann }
    nextDoc = commit(nextDoc, 'Add whiteout', before, buildSnapshot(nextDoc, state.currentPageIndex))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: nextDoc }
    set({ tabs, toolPopover: null, statusMessage: 'Whiteout added (Cover & Replace)' })
  },

  updateAnnotation: (pageId, annotationId, patch) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    if (!doc.annotationsByPage[pageId]) return
    const before = buildSnapshot(doc, state.currentPageIndex)
    const ann = cloneAnnots(doc.annotationsByPage)
    ann[pageId] = ann[pageId].map((item) => (item.id === annotationId ? ({ ...item, ...patch, updatedAt: Date.now() } as Annotation) : item))
    let nextDoc: WorkingDocument = { ...doc, annotationsByPage: ann }
    nextDoc = commit(nextDoc, 'Edit annotation', before, buildSnapshot(nextDoc, state.currentPageIndex))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: nextDoc }
    set({ tabs })
  },

  removeAnnotation: (pageId, annotationId) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    if (!doc.annotationsByPage[pageId]) return
    const before = buildSnapshot(doc, state.currentPageIndex)
    const ann = cloneAnnots(doc.annotationsByPage)
    ann[pageId] = ann[pageId].filter((item) => item.id !== annotationId)
    let nextDoc: WorkingDocument = { ...doc, annotationsByPage: ann }
    nextDoc = commit(nextDoc, 'Remove annotation', before, buildSnapshot(nextDoc, state.currentPageIndex))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: nextDoc }
    set({ tabs, selectedAnnotationId: null })
  },

  selectAnnotation: (id) => set({ selectedAnnotationId: id }),

  selectPage: (pageId, multi) => {
    set((state) => {
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return state
      const doc = state.tabs[idx].document
      const pages = doc.workingPageModels.map((page) => {
        if (page.pageId !== pageId) return multi ? page : { ...page, selected: false }
        return { ...page, selected: multi ? !page.selected : true }
      })
      const tabs = [...state.tabs]
      tabs[idx] = { ...tabs[idx], document: { ...doc, workingPageModels: pages } }
      return { tabs }
    })
  },

  clearPageSelection: () => {
    set((state) => {
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return state
      const doc = state.tabs[idx].document
      const tabs = [...state.tabs]
      tabs[idx] = { ...tabs[idx], document: { ...doc, workingPageModels: doc.workingPageModels.map((p) => ({ ...p, selected: false })) } }
      return { tabs }
    })
  },

  reorderPages: pageActions.reorderPages,
  rotateSelectedPages: pageActions.rotateSelectedPages,
  deleteSelectedPages: pageActions.deleteSelectedPages,
  insertBlankPage: pageActions.insertBlankPage,
  mergePdf: pageActions.mergePdf,
  mergeSelectedTabs: pageActions.mergeSelectedTabs,

  exportSelectedPages: documentPersistenceActions.exportSelectedPages,
  printDocument: documentPersistenceActions.printDocument,
  save: documentPersistenceActions.save,
  saveAs: documentPersistenceActions.saveAs,

  undo: () => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!doc.history.undoStack.length) return
    const cmd = doc.history.undoStack[doc.history.undoStack.length - 1]
    const nextDoc = applySnapshot(doc, cloneSnapshot(cmd.before))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: { ...nextDoc, history: { undoStack: doc.history.undoStack.slice(0, -1), redoStack: [...doc.history.redoStack, cmd] } } }
    set({ tabs, currentPageIndex: cmd.before.currentPageIndex, statusMessage: `Undo: ${cmd.label}` })
  },

  redo: () => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!doc.history.redoStack.length) return
    const cmd = doc.history.redoStack[doc.history.redoStack.length - 1]
    const nextDoc = applySnapshot(doc, cloneSnapshot(cmd.after))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: { ...nextDoc, history: { undoStack: [...doc.history.undoStack, cmd], redoStack: doc.history.redoStack.slice(0, -1) } } }
    set({ tabs, currentPageIndex: cmd.after.currentPageIndex, statusMessage: `Redo: ${cmd.label}` })
  },

  newTab: () => {
    const doc = emptyDocument()
    set((s) => ({
      tabs: [...s.tabs, tabFromDoc(doc)],
      activeTabId: doc.id,
      currentPageIndex: 0,
      tool: 'select',
      toolPopover: null,
      selectedAnnotationId: null,
      statusMessage: 'Created new tab',
    }))
  },
  switchTab: (id) => {
    if (get().tabs.some((tab) => tab.id === id)) {
      set({ activeTabId: id, currentPageIndex: 0, selectedAnnotationId: null })
    }
  },
  toggleTabSelection: (id) =>
    set((state) => ({
      selectedTabIds: state.selectedTabIds.includes(id)
        ? state.selectedTabIds.filter((tabId) => tabId !== id)
        : [...state.selectedTabIds, id],
    })),
  clearTabSelection: () => set({ selectedTabIds: [] }),
  closeTab: (id) => {
    const state = get()
    const target = state.tabs.find((tab) => tab.id === id)
    if (!target) return
    if (
      target.document.dirty &&
      !window.confirm('You have unsaved changes. Are you sure you want to close without saving?')
    ) {
      return
    }
    const tabs = state.tabs.filter((tab) => tab.id !== id)
    if (!tabs.length) {
      set({
        tabs: [],
        activeTabId: null,
        currentPageIndex: 0,
        tool: 'select',
        toolPopover: null,
        selectedAnnotationId: null,
        selectedTabIds: [],
      })
      return
    }
    set({
      tabs,
      activeTabId: state.activeTabId === id ? tabs[0].id : state.activeTabId,
      selectedAnnotationId: state.activeTabId === id ? null : state.selectedAnnotationId,
      selectedTabIds: state.selectedTabIds.filter((tabId) => tabId !== id),
    })
  },
  })
})

