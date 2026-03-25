import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

vi.mock('../lib/tauri/commands', () => ({
  pickOpenPdf: vi.fn(),
  readPdfBytes: vi.fn(),
  pickSavePdf: vi.fn(),
  safeWritePdf: vi.fn(async () => undefined),
  listRecentFiles: vi.fn(async () => []),
  storeRecentFile: vi.fn(async () => undefined),
  createTempPdfPath: vi.fn(async () => 'C:/temp/chris-print-test.pdf'),
  openPathInDefaultApp: vi.fn(async () => undefined),
}))

import { createInitialPageModels } from '../lib/pdf/pageOps'
import { useEditorStore } from './useEditorStore'
import { safeWritePdf } from '../lib/tauri/commands'

async function createSamplePdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([595, 842])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  page.drawText('Save duplication test', { x: 60, y: 760, size: 20, font })
  return pdf.save()
}

describe('save flatten behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    const bytes = await createSamplePdf()
    const pages = createInitialPageModels(1)

    useEditorStore.setState({
      tabs: [
        {
          id: 'tab1',
          title: 'sample.pdf',
          document: {
            id: 'doc1',
            sourcePath: 'C:/temp/sample.pdf',
            sourceFileName: 'sample.pdf',
            sourceBytes: new Uint8Array(bytes),
            loadedPdfProxy: null,
            workingPdfBytes: new Uint8Array(bytes),
            workingPageModels: pages,
            annotationsByPage: {
              [pages[0].pageId]: [
                {
                  id: 'anno-1',
                  pageId: pages[0].pageId,
                  type: 'textOverlay',
                  rect: { x: 0.1, y: 0.1, width: 0.3, height: 0.08 },
                  text: 'DUP_CHECK',
                  color: '#111111',
                  fontSize: 16,
                  bold: false,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
            },
            editingLocked: false,
            editingLockReason: null,
            dirty: true,
            saveStatus: 'idle',
            saveError: null,
            searchState: { query: '', matches: [], activeMatchIndex: -1 },
            history: { undoStack: [], redoStack: [] },
          },
        },
      ],
      activeTabId: 'tab1',
      currentPageIndex: 0,
      selectedAnnotationId: null,
      statusMessage: null,
      recentFiles: [],
    })
  })

  it('clears overlay annotations after successful save to avoid duplicate re-flattening', async () => {
    await useEditorStore.getState().save()

    const afterFirstSave = useEditorStore.getState().tabs[0].document
    expect(afterFirstSave.annotationsByPage).toEqual({})
    expect(afterFirstSave.dirty).toBe(false)

    await useEditorStore.getState().save()

    const afterSecondSave = useEditorStore.getState().tabs[0].document
    expect(afterSecondSave.annotationsByPage).toEqual({})
    expect(safeWritePdf).toHaveBeenCalledTimes(2)
  })

  it('blocks save for edit-locked documents', async () => {
    useEditorStore.setState((state) => ({
      tabs: [
        {
          ...state.tabs[0],
          document: {
            ...state.tabs[0].document,
            editingLocked: true,
            editingLockReason: 'This PDF can be viewed, but editing/saving is unavailable because the file is encrypted.',
          },
        },
      ],
    }))

    await useEditorStore.getState().save()

    expect(safeWritePdf).not.toHaveBeenCalled()
    expect(useEditorStore.getState().statusMessage).toContain('editing/saving is unavailable')
  })
})
