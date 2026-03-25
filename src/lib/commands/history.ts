import type { Annotation, EditorSnapshot, HistoryCommand, PageModel, WorkingDocument } from '../../types/models'

function cloneAnnotations(input: Record<string, Annotation[]>): Record<string, Annotation[]> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value.map((item) => ({ ...item, rect: { ...item.rect } }))]),
  )
}

function clonePageModels(input: PageModel[]): PageModel[] {
  return input.map((item) => ({ ...item }))
}

export function buildSnapshot(document: WorkingDocument, currentPageIndex: number): EditorSnapshot {
  return {
    workingPdfBytes: document.workingPdfBytes ? new Uint8Array(document.workingPdfBytes) : new Uint8Array(),
    workingPageModels: clonePageModels(document.workingPageModels),
    annotationsByPage: cloneAnnotations(document.annotationsByPage),
    currentPageIndex,
  }
}

export function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    workingPdfBytes: new Uint8Array(snapshot.workingPdfBytes),
    workingPageModels: clonePageModels(snapshot.workingPageModels),
    annotationsByPage: cloneAnnotations(snapshot.annotationsByPage),
    currentPageIndex: snapshot.currentPageIndex,
  }
}

export function createHistoryCommand(label: string, before: EditorSnapshot, after: EditorSnapshot): HistoryCommand {
  return {
    label,
    before: cloneSnapshot(before),
    after: cloneSnapshot(after),
    createdAt: Date.now(),
  }
}
