import { create } from 'zustand'
import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'

import { buildSnapshot, cloneSnapshot, createHistoryCommand } from '../lib/commands/history'
import { base64ToBytes, bytesToBase64 } from '../lib/pdf/encoding'
import {
  createInitialPageModels,
  exportSelectedPages as exportPages,
  flattenAnnotations,
  mergePdfIntoWorking,
  rebuildPdfFromPageModels,
} from '../lib/pdf/pageOps'
import { searchPdf } from '../lib/pdf/search'
import {
  listRecentFiles,
  pickOpenPdf,
  pickSavePdf,
  readPdfBytes,
  safeWritePdf,
  storeRecentFile,
} from '../lib/tauri/commands'
import type {
  Annotation,
  DocumentTab,
  EditorSnapshot,
  FitMode,
  PageModel,
  SessionRecoveryPayload,
  ThemeMode,
  ToolMode,
  WorkingDocument,
} from '../types/models'

const THEME_KEY = 'chris-pdf-theme'
const RECOVERY_KEY = 'chris-pdf-recovery-v1'

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
  theme: ThemeMode
  selectedAnnotationId: string | null
  statusMessage: string | null
  rightPanelOpen: boolean
  recentFiles: string[]
  recoveryAvailable: boolean
  recoveryPayload: SessionRecoveryPayload | null

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
  toggleTheme: () => void
  toggleOrganizerMode: () => void
  toggleRightPanel: () => void
  runSearch: (query: string) => Promise<void>
  gotoNextMatch: () => void
  gotoPreviousMatch: () => void
  addHighlights: (pageId: string, rects: Array<{ x: number; y: number; width: number; height: number }>) => void
  addTextOverlay: (pageId: string, rect: { x: number; y: number; width: number; height: number }) => void
  addWhiteout: (pageId: string, rect: { x: number; y: number; width: number; height: number }, replacement?: string) => void
  addStamp: () => void
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
  exportSelectedPages: () => Promise<void>
  save: () => Promise<void>
  saveAs: () => Promise<void>
  undo: () => void
  redo: () => void
  newTab: () => void
  switchTab: (id: string) => void
  closeTab: (id: string) => void
  restoreRecoverySession: () => Promise<void>
  dismissRecovery: () => void
}

export type EditorStore = Store

function persistRecoveryState(state: Store): void {
  const payload: SessionRecoveryPayload = {
    tabs: state.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      active: tab.id === state.activeTabId,
      sourcePath: tab.document.sourcePath,
      sourceFileName: tab.document.sourceFileName,
      workingPdfBase64: tab.document.workingPdfBytes ? bytesToBase64(tab.document.workingPdfBytes) : null,
      sourcePdfBase64: tab.document.sourceBytes ? bytesToBase64(tab.document.sourceBytes) : null,
      pageModels: tab.document.workingPageModels,
      annotationsByPage: tab.document.annotationsByPage,
      dirty: tab.document.dirty,
      currentPageIndex: state.currentPageIndex,
    })),
    timestamp: Date.now(),
  }
  if (!state.tabs.some((tab) => tab.document.dirty)) {
    localStorage.removeItem(RECOVERY_KEY)
    return
  }
  localStorage.setItem(RECOVERY_KEY, JSON.stringify(payload))
}

function commit(
  doc: WorkingDocument,
  label: string,
  before: EditorSnapshot,
  after: EditorSnapshot,
): WorkingDocument {
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

export const useEditorStore = create<Store>((set, get) => ({
  tabs: [tabFromDoc(emptyDocument())],
  activeTabId: null,
  currentPageIndex: 0,
  zoom: 1,
  fitMode: 'custom',
  organizerMode: false,
  tool: 'select',
  theme: 'light',
  selectedAnnotationId: null,
  statusMessage: null,
  rightPanelOpen: true,
  recentFiles: [],
  recoveryAvailable: false,
  recoveryPayload: null,

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
    const recovery = localStorage.getItem(RECOVERY_KEY)
    if (recovery) {
      try {
        set({ recoveryAvailable: true, recoveryPayload: JSON.parse(recovery) as SessionRecoveryPayload })
      } catch {
        localStorage.removeItem(RECOVERY_KEY)
      }
    }
  },

  openPdf: async (newTab = false) => {
    const path = await pickOpenPdf()
    if (!path) return
    await get().openRecent(path, newTab)
  },

  openRecent: async (path: string, newTab = false) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx >= 0 && !newTab && state.tabs[idx].document.dirty) {
      if (!window.confirm('Unsaved changes exist. Continue and discard them?')) return
    }
    try {
      const doc = await loadDoc(path)
      let targetTabId = doc.id
      if (newTab || idx === -1) {
        set((s) => ({
          tabs: [...s.tabs, tabFromDoc(doc)],
          activeTabId: doc.id,
          currentPageIndex: 0,
          zoom: 1,
          fitMode: 'custom',
          statusMessage: `Opened ${doc.sourceFileName}`,
        }))
      } else {
        targetTabId = state.tabs[idx].id
        set((s) => {
          const tabs = [...s.tabs]
          tabs[idx] = { id: tabs[idx].id, title: doc.sourceFileName, document: doc }
          return { tabs, currentPageIndex: 0, zoom: 1, fitMode: 'custom', statusMessage: `Opened ${doc.sourceFileName}` }
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
            persistRecoveryState(get())
          })
          .catch((error) => {
            console.error('[openRecent:editing-support-check]', error)
          })
      }

      persistRecoveryState(get())
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
  setTool: (tool) => set({ tool }),
  toggleTheme: () => set((state) => { const theme = state.theme === 'dark' ? 'light' : 'dark'; setTheme(theme); return { theme } }),
  toggleOrganizerMode: () => set((state) => ({ organizerMode: !state.organizerMode })),
  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

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
    const before = buildSnapshot(doc, state.currentPageIndex)
    const ann = cloneAnnots(doc.annotationsByPage)
    const now = Date.now()
    ann[pageId] = [
      ...(ann[pageId] ?? []),
      ...rects.map((rect) => ({ id: crypto.randomUUID(), pageId, type: 'highlight' as const, rect, color: '#FFE066', opacity: 0.45, createdAt: now, updatedAt: now })),
    ]
    let nextDoc: WorkingDocument = { ...doc, annotationsByPage: ann }
    nextDoc = commit(nextDoc, 'Add highlight', before, buildSnapshot(nextDoc, state.currentPageIndex))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: nextDoc }
    set({ tabs, statusMessage: 'Highlight added' })
    persistRecoveryState(get())
  },

  addTextOverlay: (pageId, rect) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    const before = buildSnapshot(doc, state.currentPageIndex)
    const ann = cloneAnnots(doc.annotationsByPage)
    const now = Date.now()
    const entry: Annotation = { id: crypto.randomUUID(), pageId, type: 'textOverlay', rect, text: 'Text', color: '#111827', fontSize: 14, bold: false, createdAt: now, updatedAt: now }
    ann[pageId] = [...(ann[pageId] ?? []), entry]
    let nextDoc: WorkingDocument = { ...doc, annotationsByPage: ann }
    nextDoc = commit(nextDoc, 'Add text overlay', before, buildSnapshot(nextDoc, state.currentPageIndex))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: nextDoc }
    set({ tabs, selectedAnnotationId: entry.id, statusMessage: 'Text overlay added' })
    persistRecoveryState(get())
  },

  addWhiteout: (pageId, rect, replacement) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    const before = buildSnapshot(doc, state.currentPageIndex)
    const ann = cloneAnnots(doc.annotationsByPage)
    const now = Date.now()
    const next: Annotation[] = [...(ann[pageId] ?? [])]
    next.push({ id: crypto.randomUUID(), pageId, type: 'whiteoutRect', rect, fill: '#FFFFFF', createdAt: now, updatedAt: now })
    if (replacement && replacement.trim()) {
      next.push({ id: crypto.randomUUID(), pageId, type: 'replacementText', rect, text: replacement, color: '#111827', fontSize: 14, bold: false, createdAt: now, updatedAt: now })
    }
    ann[pageId] = next
    let nextDoc: WorkingDocument = { ...doc, annotationsByPage: ann }
    nextDoc = commit(nextDoc, 'Add whiteout', before, buildSnapshot(nextDoc, state.currentPageIndex))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: nextDoc }
    set({ tabs, statusMessage: 'Whiteout added (Cover & Replace)' })
    persistRecoveryState(get())
  },

  addStamp: () => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    const page = doc.workingPageModels[state.currentPageIndex]
    if (!page) return
    const before = buildSnapshot(doc, state.currentPageIndex)
    const ann = cloneAnnots(doc.annotationsByPage)
    const now = Date.now()
    const stamp: Annotation = {
      id: crypto.randomUUID(),
      pageId: page.pageId,
      type: 'textOverlay',
      rect: { x: 0.62, y: 0.08, width: 0.28, height: 0.08 },
      text: 'APPROVED',
      color: '#0f766e',
      fontSize: 22,
      bold: true,
      createdAt: now,
      updatedAt: now,
    }
    ann[page.pageId] = [...(ann[page.pageId] ?? []), stamp]
    let nextDoc: WorkingDocument = { ...doc, annotationsByPage: ann }
    nextDoc = commit(nextDoc, 'Add stamp', before, buildSnapshot(nextDoc, state.currentPageIndex))
    const tabs = [...state.tabs]
    tabs[idx] = { ...tabs[idx], document: nextDoc }
    set({ tabs, selectedAnnotationId: stamp.id, statusMessage: 'Stamp added' })
    persistRecoveryState(get())
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
    persistRecoveryState(get())
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
    persistRecoveryState(get())
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

  reorderPages: async (from, to) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1 || from === to) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    if (!doc.workingPdfBytes) return
    const pages = [...doc.workingPageModels]
    const [moved] = pages.splice(from, 1)
    pages.splice(to, 0, moved)
    const nextPages = normalizePages(pages)
    try {
      const before = buildSnapshot(doc, state.currentPageIndex)
      const bytes = await rebuildPdfFromPageModels(doc.workingPdfBytes, doc.workingPageModels, nextPages)
      let nextDoc: WorkingDocument = { ...doc, workingPdfBytes: bytes, loadedPdfProxy: null, workingPageModels: nextPages }
      nextDoc = commit(nextDoc, 'Reorder pages', before, buildSnapshot(nextDoc, state.currentPageIndex))
      const tabs = [...state.tabs]
      tabs[idx] = { ...tabs[idx], document: nextDoc }
      set({ tabs, statusMessage: 'Pages reordered' })
      persistRecoveryState(get())
    } catch (e) {
      set({ statusMessage: e instanceof Error ? e.message : String(e) })
    }
  },

  rotateSelectedPages: async (delta) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    if (!doc.workingPdfBytes) return
    const selectedIds = new Set(doc.workingPageModels.filter((p) => p.selected).map((p) => p.pageId))
    if (!selectedIds.size && doc.workingPageModels[state.currentPageIndex]) selectedIds.add(doc.workingPageModels[state.currentPageIndex].pageId)
    if (!selectedIds.size) return
    const nextPages = normalizePages(doc.workingPageModels.map((p) => (selectedIds.has(p.pageId) ? { ...p, rotation: p.rotation + delta } : p)))
    try {
      const before = buildSnapshot(doc, state.currentPageIndex)
      const bytes = await rebuildPdfFromPageModels(doc.workingPdfBytes, doc.workingPageModels, nextPages)
      let nextDoc: WorkingDocument = { ...doc, workingPdfBytes: bytes, loadedPdfProxy: null, workingPageModels: nextPages }
      nextDoc = commit(nextDoc, 'Rotate pages', before, buildSnapshot(nextDoc, state.currentPageIndex))
      const tabs = [...state.tabs]
      tabs[idx] = { ...tabs[idx], document: nextDoc }
      set({ tabs, statusMessage: 'Page rotation updated' })
      persistRecoveryState(get())
    } catch (e) {
      set({ statusMessage: e instanceof Error ? e.message : String(e) })
    }
  },

  deleteSelectedPages: async () => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    if (!doc.workingPdfBytes) return
    const selected = new Set(doc.workingPageModels.filter((p) => p.selected).map((p) => p.pageId))
    if (!selected.size && doc.workingPageModels[state.currentPageIndex]) selected.add(doc.workingPageModels[state.currentPageIndex].pageId)
    if (!selected.size) return
    const remaining = normalizePages(doc.workingPageModels.filter((p) => !selected.has(p.pageId)))
    try {
      const before = buildSnapshot(doc, state.currentPageIndex)
      const model = remaining.length
        ? remaining
        : [{ pageId: crypto.randomUUID(), sourcePageIndex: -1, currentOrderIndex: 0, rotation: 0, selected: false, deleted: false, inserted: true }]
      const bytes = await rebuildPdfFromPageModels(doc.workingPdfBytes, doc.workingPageModels, model)
      const ann = cloneAnnots(doc.annotationsByPage)
      selected.forEach((id) => delete ann[id])
      let nextDoc: WorkingDocument = { ...doc, workingPdfBytes: bytes, loadedPdfProxy: null, workingPageModels: model, annotationsByPage: ann }
      nextDoc = commit(nextDoc, 'Delete pages', before, buildSnapshot(nextDoc, Math.min(state.currentPageIndex, Math.max(0, model.length - 1))))
      const tabs = [...state.tabs]
      tabs[idx] = { ...tabs[idx], document: nextDoc }
      set({ tabs, currentPageIndex: Math.min(state.currentPageIndex, Math.max(0, model.length - 1)), statusMessage: 'Selected pages removed' })
      persistRecoveryState(get())
    } catch (e) {
      set({ statusMessage: e instanceof Error ? e.message : String(e) })
    }
  },

  insertBlankPage: async (index) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    if (!doc.workingPdfBytes) return
    const at = Math.max(0, Math.min(index, doc.workingPageModels.length))
    const blank: PageModel = { pageId: crypto.randomUUID(), sourcePageIndex: -1, currentOrderIndex: at, rotation: 0, selected: false, deleted: false, inserted: true }
    const pages = [...doc.workingPageModels]
    pages.splice(at, 0, blank)
    const nextPages = normalizePages(pages)
    try {
      const before = buildSnapshot(doc, state.currentPageIndex)
      const bytes = await rebuildPdfFromPageModels(doc.workingPdfBytes, doc.workingPageModels, nextPages)
      let nextDoc: WorkingDocument = { ...doc, workingPdfBytes: bytes, loadedPdfProxy: null, workingPageModels: nextPages }
      nextDoc = commit(nextDoc, 'Insert blank page', before, buildSnapshot(nextDoc, at))
      const tabs = [...state.tabs]
      tabs[idx] = { ...tabs[idx], document: nextDoc }
      set({ tabs, currentPageIndex: at, statusMessage: 'Blank page inserted' })
      persistRecoveryState(get())
    } catch (e) {
      set({ statusMessage: e instanceof Error ? e.message : String(e) })
    }
  },

  mergePdf: async (mode) => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    if (!doc.workingPdfBytes) return
    const path = await pickOpenPdf()
    if (!path) return
    try {
      const importBytes = await readPdfBytes(path)
      const selected = doc.workingPageModels.map((p, i) => ({ p, i })).filter(({ p }) => p.selected).map(({ i }) => i)
      const insertAt = selected.length && mode !== 'append' ? (mode === 'before' ? selected[0] : selected[0] + 1) : undefined
      const before = buildSnapshot(doc, state.currentPageIndex)
      const merged = await mergePdfIntoWorking(doc.workingPdfBytes, importBytes, insertAt)
      const imported = createInitialPageModels(merged.insertedPageCount).map((p) => ({ ...p, inserted: true }))
      const nextPages = [...doc.workingPageModels]
      if (insertAt === undefined) nextPages.push(...imported); else nextPages.splice(insertAt, 0, ...imported)
      let nextDoc: WorkingDocument = { ...doc, workingPdfBytes: merged.bytes, loadedPdfProxy: null, workingPageModels: normalizePages(nextPages) }
      nextDoc = commit(nextDoc, 'Merge PDF', before, buildSnapshot(nextDoc, state.currentPageIndex))
      const tabs = [...state.tabs]
      tabs[idx] = { ...tabs[idx], document: nextDoc }
      set({ tabs, statusMessage: `Merged ${merged.insertedPageCount} pages` })
      persistRecoveryState(get())
    } catch (e) {
      set({ statusMessage: e instanceof Error ? e.message : String(e) })
    }
  },

  exportSelectedPages: async () => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    if (!doc.workingPdfBytes) return
    const selected = doc.workingPageModels.map((p, i) => ({ p, i })).filter(({ p }) => p.selected).map(({ i }) => i)
    const indices = selected.length ? selected : [state.currentPageIndex]
    try {
      const bytes = await exportPages(doc.workingPdfBytes, indices)
      const path = await pickSavePdf('exported-pages.pdf')
      if (!path) return
      await safeWritePdf(path, bytes, false)
      set({ statusMessage: 'Selected pages exported' })
    } catch (e) {
      set({ statusMessage: logAndMessage('exportSelectedPages', e, 'Export failed') })
    }
  },

  save: async () => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    const doc = state.tabs[idx].document
    if (!ensureEditable(set, doc)) return
    if (!doc.workingPdfBytes) return
    let out = doc.sourcePath
    if (!out) out = await pickSavePdf(doc.sourceFileName || 'document.pdf')
    if (!out) return
    try {
      const flattened = await flattenAnnotations(doc.workingPdfBytes, doc.workingPageModels, doc.annotationsByPage)
      await safeWritePdf(out, flattened, true)
      await storeRecentFile(out)
      const recent = await listRecentFiles()
      set((s) => {
        const i = activeIndex(s.tabs, s.activeTabId)
        if (i === -1) return { recentFiles: recent }
        const tabs = [...s.tabs]
        tabs[i] = {
          ...tabs[i],
          title: fileName(out!),
          document: { ...tabs[i].document, sourcePath: out!, sourceFileName: fileName(out!), sourceBytes: new Uint8Array(flattened), workingPdfBytes: new Uint8Array(flattened), loadedPdfProxy: null, dirty: false, saveStatus: 'saved', saveError: null, history: { undoStack: [], redoStack: [] } },
        }
        return { tabs, recentFiles: recent, statusMessage: `Saved ${fileName(out!)}` }
      })
      persistRecoveryState(get())
    } catch (e) {
      set({ statusMessage: logAndMessage('save', e, 'Save failed') })
    }
  },

  saveAs: async () => {
    const state = get()
    const idx = activeIndex(state.tabs, state.activeTabId)
    if (idx === -1) return
    if (!ensureEditable(set, state.tabs[idx].document)) return
    const path = await pickSavePdf(state.tabs[idx].document.sourceFileName || 'document.pdf')
    if (!path) return
    set((s) => {
      const i = activeIndex(s.tabs, s.activeTabId)
      if (i === -1) return s
      const tabs = [...s.tabs]
      tabs[i] = { ...tabs[i], document: { ...tabs[i].document, sourcePath: path } }
      return { tabs }
    })
    await get().save()
  },

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
    persistRecoveryState(get())
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
    persistRecoveryState(get())
  },

  newTab: () => { const doc = emptyDocument(); set((s) => ({ tabs: [...s.tabs, tabFromDoc(doc)], activeTabId: doc.id, currentPageIndex: 0, statusMessage: 'Created new tab' })) },
  switchTab: (id) => { if (get().tabs.some((tab) => tab.id === id)) set({ activeTabId: id, currentPageIndex: 0, selectedAnnotationId: null }) },
  closeTab: (id) => {
    const state = get()
    const target = state.tabs.find((tab) => tab.id === id)
    if (!target) return
    if (target.document.dirty && !window.confirm(`Tab ${target.title} has unsaved changes. Close anyway?`)) return
    const tabs = state.tabs.filter((tab) => tab.id !== id)
    if (!tabs.length) {
      const doc = emptyDocument()
      set({ tabs: [tabFromDoc(doc)], activeTabId: doc.id, currentPageIndex: 0 })
      return
    }
    set({ tabs, activeTabId: state.activeTabId === id ? tabs[0].id : state.activeTabId })
  },

  restoreRecoverySession: async () => {
    const payload = get().recoveryPayload
    if (!payload) return
    const tabs: DocumentTab[] = payload.tabs
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        document: {
          ...emptyDocument(entry.sourceFileName),
          id: entry.id,
          sourcePath: entry.sourcePath,
          sourceFileName: entry.sourceFileName,
          sourceBytes: entry.sourcePdfBase64 ? base64ToBytes(entry.sourcePdfBase64) : null,
          workingPdfBytes: entry.workingPdfBase64 ? base64ToBytes(entry.workingPdfBase64) : null,
          workingPageModels: normalizePages(clonePages(entry.pageModels)),
          annotationsByPage: cloneAnnots(entry.annotationsByPage),
          dirty: entry.dirty,
        },
      }))
      .filter((tab) => tab.document.workingPdfBytes)
    if (!tabs.length) return
    const active = payload.tabs.find((entry) => entry.active)
    set({ tabs, activeTabId: active?.id ?? tabs[0].id, currentPageIndex: active?.currentPageIndex ?? 0, recoveryAvailable: false, recoveryPayload: null, statusMessage: 'Recovered unsaved session' })
  },

  dismissRecovery: () => { localStorage.removeItem(RECOVERY_KEY); set({ recoveryAvailable: false, recoveryPayload: null }) },
}))
