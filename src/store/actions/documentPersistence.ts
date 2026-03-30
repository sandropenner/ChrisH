import { exportSelectedPages as exportPages, flattenAnnotations } from '../../lib/pdf/pageOps'
import {
  createTempPdfPath,
  listRecentFiles,
  openPathInDefaultApp,
  pickSavePdf,
  safeWritePdf,
  storeRecentFile,
} from '../../lib/tauri/commands'
import type { EditorStore } from '../useEditorStore'

type StoreSet = (
  partial:
    | Partial<EditorStore>
    | ((state: EditorStore) => Partial<EditorStore> | EditorStore),
) => void

type StoreGet = () => EditorStore

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

function ensureEditable(set: StoreSet, editingLocked: boolean, editingLockReason: string | null): boolean {
  if (!editingLocked) return true
  set({
    statusMessage:
      editingLockReason ??
      'This PDF can be viewed, but editing/saving is unavailable because the file is encrypted.',
  })
  return false
}

interface PersistenceContext {
  set: StoreSet
  get: StoreGet
  activeIndex: (tabs: EditorStore['tabs'], activeTabId: string | null) => number
  fileName: (path: string) => string
}

export function createDocumentPersistenceActions(context: PersistenceContext) {
  const { set, get, activeIndex, fileName } = context

  return {
    exportSelectedPages: async () => {
      const state = get()
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return
      const doc = state.tabs[idx].document
      if (!ensureEditable(set, doc.editingLocked, doc.editingLockReason)) return
      if (!doc.workingPdfBytes) return
      const selected = doc.workingPageModels
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.selected)
        .map(({ i }) => i)
      const indices = selected.length ? selected : [state.currentPageIndex]
      try {
        const bytes = await exportPages(doc.workingPdfBytes, indices)
        const path = await pickSavePdf('exported-pages.pdf')
        if (!path) return
        await safeWritePdf(path, bytes, false)
        set({ statusMessage: 'Selected pages exported' })
      } catch (error) {
        set({ statusMessage: logAndMessage('exportSelectedPages', error, 'Export failed') })
      }
    },

    printDocument: async () => {
      const state = get()
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return
      const doc = state.tabs[idx].document
      if (!doc.workingPdfBytes) return

      try {
        const bytes = doc.editingLocked
          ? new Uint8Array(doc.workingPdfBytes)
          : await flattenAnnotations(doc.workingPdfBytes, doc.workingPageModels, doc.annotationsByPage)
        const tempPath = await createTempPdfPath('chris-print')
        await safeWritePdf(tempPath, bytes, false)
        // Reliable fallback across desktop environments: open the composed PDF in the system viewer for printing.
        await openPathInDefaultApp(tempPath)
        set({
          statusMessage: doc.editingLocked
            ? 'Opened view-only PDF in your default viewer for printing.'
            : 'Opened printable PDF in your default viewer.',
        })
      } catch (error) {
        set({ statusMessage: logAndMessage('printDocument', error, 'Print preparation failed') })
      }
    },

    save: async () => {
      const state = get()
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return
      const doc = state.tabs[idx].document
      if (!ensureEditable(set, doc.editingLocked, doc.editingLockReason)) return
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
            document: {
              ...tabs[i].document,
              sourcePath: out!,
              sourceFileName: fileName(out!),
              sourceBytes: new Uint8Array(flattened),
              workingPdfBytes: new Uint8Array(flattened),
              loadedPdfProxy: null,
              annotationsByPage: {},
              dirty: false,
              saveStatus: 'saved',
              saveError: null,
              history: { undoStack: [], redoStack: [] },
            },
          }
          return {
            tabs,
            recentFiles: recent,
            selectedAnnotationId: null,
            statusMessage: `Saved ${fileName(out!)}`,
          }
        })
      } catch (error) {
        set({ statusMessage: logAndMessage('save', error, 'Save failed') })
      }
    },

    saveAs: async () => {
      const state = get()
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return
      const doc = state.tabs[idx].document
      if (!ensureEditable(set, doc.editingLocked, doc.editingLockReason)) return
      const path = await pickSavePdf(doc.sourceFileName || 'document.pdf')
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
  }
}
