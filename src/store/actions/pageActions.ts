import {
  createInitialPageModels,
  mergePdfDocumentsInOrder,
  mergePdfIntoWorking,
  rebuildPdfFromPageModels,
} from '../../lib/pdf/pageOps'
import { pickOpenPdf, readPdfBytes } from '../../lib/tauri/commands'
import type { Annotation, EditorSnapshot, PageModel, WorkingDocument } from '../../types/models'
import type { EditorStore } from '../useEditorStore'

type StoreSet = (
  partial:
    | Partial<EditorStore>
    | ((state: EditorStore) => Partial<EditorStore> | EditorStore),
) => void

type StoreGet = () => EditorStore

type EnsureEditable = (setter: (value: Partial<EditorStore>) => void, doc: WorkingDocument) => boolean
type BuildSnapshot = (doc: WorkingDocument, currentPageIndex: number) => EditorSnapshot
type CommitDoc = (
  doc: WorkingDocument,
  label: string,
  before: EditorSnapshot,
  after: EditorSnapshot,
) => WorkingDocument

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

interface PageActionsContext {
  set: StoreSet
  get: StoreGet
  activeIndex: (tabs: EditorStore['tabs'], activeTabId: string | null) => number
  ensureEditable: EnsureEditable
  buildSnapshot: BuildSnapshot
  commit: CommitDoc
  normalizePages: (pages: PageModel[]) => PageModel[]
  cloneAnnots: (ann: Record<string, Annotation[]>) => Record<string, Annotation[]>
  emptyDocument: (title?: string) => WorkingDocument
  tabFromDoc: (doc: WorkingDocument) => { id: string; title: string; document: WorkingDocument }
}

export function createPageActions(context: PageActionsContext) {
  const { set, get, activeIndex, ensureEditable, buildSnapshot, commit, normalizePages, cloneAnnots, emptyDocument, tabFromDoc } = context

  return {
    reorderPages: async (from: number, to: number) => {
      const state = get()
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1 || from === to) return
      const doc = state.tabs[idx].document
      if (!ensureEditable(set as (value: Partial<EditorStore>) => void, doc)) return
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
      } catch (error) {
        set({ statusMessage: errorText(error) })
      }
    },

    rotateSelectedPages: async (delta: number) => {
      const state = get()
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return
      const doc = state.tabs[idx].document
      if (!ensureEditable(set as (value: Partial<EditorStore>) => void, doc)) return
      if (!doc.workingPdfBytes) return
      const selectedIds = new Set(doc.workingPageModels.filter((p) => p.selected).map((p) => p.pageId))
      if (!selectedIds.size && doc.workingPageModels[state.currentPageIndex]) {
        selectedIds.add(doc.workingPageModels[state.currentPageIndex].pageId)
      }
      if (!selectedIds.size) return
      const nextPages = normalizePages(
        doc.workingPageModels.map((p) => (selectedIds.has(p.pageId) ? { ...p, rotation: p.rotation + delta } : p)),
      )
      try {
        const before = buildSnapshot(doc, state.currentPageIndex)
        const bytes = await rebuildPdfFromPageModels(doc.workingPdfBytes, doc.workingPageModels, nextPages)
        let nextDoc: WorkingDocument = { ...doc, workingPdfBytes: bytes, loadedPdfProxy: null, workingPageModels: nextPages }
        nextDoc = commit(nextDoc, 'Rotate pages', before, buildSnapshot(nextDoc, state.currentPageIndex))
        const tabs = [...state.tabs]
        tabs[idx] = { ...tabs[idx], document: nextDoc }
        set({ tabs, statusMessage: 'Page rotation updated' })
      } catch (error) {
        set({ statusMessage: errorText(error) })
      }
    },

    deleteSelectedPages: async () => {
      const state = get()
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return
      const doc = state.tabs[idx].document
      if (!ensureEditable(set as (value: Partial<EditorStore>) => void, doc)) return
      if (!doc.workingPdfBytes) return
      const selected = new Set(doc.workingPageModels.filter((p) => p.selected).map((p) => p.pageId))
      if (!selected.size && doc.workingPageModels[state.currentPageIndex]) {
        selected.add(doc.workingPageModels[state.currentPageIndex].pageId)
      }
      if (!selected.size) return
      const remaining = normalizePages(doc.workingPageModels.filter((p) => !selected.has(p.pageId)))
      try {
        const before = buildSnapshot(doc, state.currentPageIndex)
        const model = remaining.length
          ? remaining
          : [
              {
                pageId: crypto.randomUUID(),
                sourcePageIndex: -1,
                currentOrderIndex: 0,
                rotation: 0,
                selected: false,
                deleted: false,
                inserted: true,
              },
            ]
        const bytes = await rebuildPdfFromPageModels(doc.workingPdfBytes, doc.workingPageModels, model)
        const ann = cloneAnnots(doc.annotationsByPage)
        selected.forEach((id) => delete ann[id])
        let nextDoc: WorkingDocument = {
          ...doc,
          workingPdfBytes: bytes,
          loadedPdfProxy: null,
          workingPageModels: model,
          annotationsByPage: ann,
        }
        nextDoc = commit(
          nextDoc,
          'Delete pages',
          before,
          buildSnapshot(nextDoc, Math.min(state.currentPageIndex, Math.max(0, model.length - 1))),
        )
        const tabs = [...state.tabs]
        tabs[idx] = { ...tabs[idx], document: nextDoc }
        set({
          tabs,
          currentPageIndex: Math.min(state.currentPageIndex, Math.max(0, model.length - 1)),
          statusMessage: 'Selected pages removed',
        })
      } catch (error) {
        set({ statusMessage: errorText(error) })
      }
    },

    insertBlankPage: async (index: number) => {
      const state = get()
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return
      const doc = state.tabs[idx].document
      if (!ensureEditable(set as (value: Partial<EditorStore>) => void, doc)) return
      if (!doc.workingPdfBytes) return
      const at = Math.max(0, Math.min(index, doc.workingPageModels.length))
      const blank: PageModel = {
        pageId: crypto.randomUUID(),
        sourcePageIndex: -1,
        currentOrderIndex: at,
        rotation: 0,
        selected: false,
        deleted: false,
        inserted: true,
      }
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
      } catch (error) {
        set({ statusMessage: errorText(error) })
      }
    },

    mergePdf: async (mode: 'append' | 'before' | 'after') => {
      const state = get()
      const idx = activeIndex(state.tabs, state.activeTabId)
      if (idx === -1) return
      const doc = state.tabs[idx].document
      if (!ensureEditable(set as (value: Partial<EditorStore>) => void, doc)) return
      if (!doc.workingPdfBytes) return
      const path = await pickOpenPdf()
      if (!path) return
      try {
        const importBytes = await readPdfBytes(path)
        const selected = doc.workingPageModels
          .map((p, i) => ({ p, i }))
          .filter(({ p }) => p.selected)
          .map(({ i }) => i)
        const insertAt = selected.length && mode !== 'append' ? (mode === 'before' ? selected[0] : selected[0] + 1) : undefined
        const before = buildSnapshot(doc, state.currentPageIndex)
        const merged = await mergePdfIntoWorking(doc.workingPdfBytes, importBytes, insertAt)
        const imported = createInitialPageModels(merged.insertedPageCount).map((p) => ({ ...p, inserted: true }))
        const nextPages = [...doc.workingPageModels]
        if (insertAt === undefined) {
          nextPages.push(...imported)
        } else {
          nextPages.splice(insertAt, 0, ...imported)
        }
        let nextDoc: WorkingDocument = {
          ...doc,
          workingPdfBytes: merged.bytes,
          loadedPdfProxy: null,
          workingPageModels: normalizePages(nextPages),
        }
        nextDoc = commit(nextDoc, 'Merge PDF', before, buildSnapshot(nextDoc, state.currentPageIndex))
        const tabs = [...state.tabs]
        tabs[idx] = { ...tabs[idx], document: nextDoc }
        set({ tabs, statusMessage: `Merged ${merged.insertedPageCount} pages` })
      } catch (error) {
        set({ statusMessage: errorText(error) })
      }
    },

    mergeSelectedTabs: async () => {
      const state = get()
      const selected = state.tabs.filter((tab) => state.selectedTabIds.includes(tab.id))
      if (selected.length < 2) {
        set({ statusMessage: 'Select at least two tabs to merge.' })
        return
      }
      const nonMergeable = selected.find((tab) => tab.document.editingLocked || !tab.document.workingPdfBytes)
      if (nonMergeable) {
        set({
          statusMessage: 'One or more selected tabs cannot be merged (view-only/encrypted or missing PDF bytes).',
        })
        return
      }

      try {
        const mergedBytes = await mergePdfDocumentsInOrder(
          selected.map((tab) => new Uint8Array(tab.document.workingPdfBytes!)),
        )
        const mergedTitle = `merged-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`
        const doc: WorkingDocument = {
          ...emptyDocument(mergedTitle),
          id: crypto.randomUUID(),
          sourceFileName: mergedTitle,
          sourceBytes: new Uint8Array(mergedBytes),
          workingPdfBytes: new Uint8Array(mergedBytes),
        }
        set((current) => ({
          tabs: [...current.tabs, tabFromDoc(doc)],
          activeTabId: doc.id,
          currentPageIndex: 0,
          tool: 'select',
          toolPopover: null,
          selectedAnnotationId: null,
          selectedTabIds: [],
          zoom: 1,
          fitMode: 'custom',
          statusMessage: `Merged ${selected.length} open tabs into ${mergedTitle}`,
        }))
      } catch (error) {
        console.error('[mergeSelectedTabs]', error)
        set({ statusMessage: 'Failed to merge selected tabs.' })
      }
    },
  }
}
