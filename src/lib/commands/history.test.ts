import { describe, expect, it } from 'vitest'

import { buildSnapshot, cloneSnapshot, createHistoryCommand } from './history'
import type { WorkingDocument } from '../../types/models'

function makeDoc(): WorkingDocument {
  return {
    id: 'doc',
    sourcePath: null,
    sourceFileName: 'doc.pdf',
    sourceBytes: null,
    loadedPdfProxy: null,
    workingPdfBytes: new Uint8Array([37, 80, 68, 70]),
    workingPageModels: [
      {
        pageId: 'a',
        sourcePageIndex: 0,
        currentOrderIndex: 0,
        rotation: 0,
        selected: false,
        deleted: false,
        inserted: false,
      },
    ],
    annotationsByPage: {
      a: [
        {
          id: 'h1',
          pageId: 'a',
          type: 'highlight',
          rect: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
          color: '#ffff00',
          opacity: 0.5,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    },
    editingLocked: false,
    editingLockReason: null,
    dirty: false,
    saveStatus: 'idle',
    saveError: null,
    searchState: { query: '', matches: [], activeMatchIndex: -1 },
    history: { undoStack: [], redoStack: [] },
  }
}

describe('history helpers', () => {
  it('builds independent snapshots', () => {
    const doc = makeDoc()
    const snap = buildSnapshot(doc, 0)
    doc.workingPageModels[0].rotation = 90
    expect(snap.workingPageModels[0].rotation).toBe(0)
  })

  it('creates history command with isolated before/after', () => {
    const before = buildSnapshot(makeDoc(), 0)
    const after = cloneSnapshot(before)
    after.currentPageIndex = 1
    const command = createHistoryCommand('Change', before, after)
    after.currentPageIndex = 2
    expect(command.after.currentPageIndex).toBe(1)
  })
})
