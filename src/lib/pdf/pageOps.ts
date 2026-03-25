import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib'

import type { Annotation, PageModel } from '../../types/models'

const DEFAULT_PAGE_WIDTH = 595
const DEFAULT_PAGE_HEIGHT = 842

function normalizeRotation(rotation: number): number {
  const value = rotation % 360
  return value < 0 ? value + 360 : value
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim()
  if (normalized.length !== 6) {
    return { r: 0, g: 0, b: 0 }
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255
  return { r, g, b }
}

export function createInitialPageModels(pageCount: number): PageModel[] {
  return Array.from({ length: pageCount }, (_, index) => ({
    pageId: crypto.randomUUID(),
    sourcePageIndex: index,
    currentOrderIndex: index,
    rotation: 0,
    selected: false,
    deleted: false,
    inserted: false,
  }))
}

export async function rebuildPdfFromPageModels(
  currentPdfBytes: Uint8Array,
  currentModels: PageModel[],
  nextModels: PageModel[],
): Promise<Uint8Array> {
  const source = await PDFDocument.load(currentPdfBytes)
  const result = await PDFDocument.create()

  const sourcePageCount = source.getPageCount()
  let fallbackSize: [number, number] = [DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_HEIGHT]
  if (sourcePageCount > 0) {
    const first = source.getPage(0)
    fallbackSize = [first.getWidth(), first.getHeight()]
  }

  const oldIndexById = new Map<string, number>()
  currentModels.forEach((item, index) => oldIndexById.set(item.pageId, index))

  for (const model of nextModels) {
    const oldIndex = oldIndexById.get(model.pageId)
    if (oldIndex === undefined) {
      const blank = result.addPage(fallbackSize)
      blank.setRotation(degrees(normalizeRotation(model.rotation)))
      continue
    }

    const [copied] = await result.copyPages(source, [oldIndex])
    copied.setRotation(degrees(normalizeRotation(model.rotation)))
    result.addPage(copied)
  }

  return result.save()
}

export async function mergePdfIntoWorking(
  workingPdfBytes: Uint8Array,
  importedPdfBytes: Uint8Array,
  insertAtIndex?: number,
): Promise<{ bytes: Uint8Array; insertedPageCount: number }> {
  const working = await PDFDocument.load(workingPdfBytes)
  const imported = await PDFDocument.load(importedPdfBytes)
  const importedIndices = imported.getPageIndices()
  const copiedPages = await working.copyPages(imported, importedIndices)

  if (insertAtIndex === undefined || insertAtIndex < 0 || insertAtIndex >= working.getPageCount()) {
    copiedPages.forEach((page) => working.addPage(page))
  } else {
    copiedPages.forEach((page, offset) => working.insertPage(insertAtIndex + offset, page))
  }

  return {
    bytes: await working.save(),
    insertedPageCount: copiedPages.length,
  }
}

export async function mergePdfDocumentsInOrder(pdfInputs: Uint8Array[]): Promise<Uint8Array> {
  if (pdfInputs.length < 2) {
    throw new Error('At least two PDFs are required to merge open tabs.')
  }
  const out = await PDFDocument.create()
  for (const bytes of pdfInputs) {
    const source = await PDFDocument.load(bytes)
    const copied = await out.copyPages(source, source.getPageIndices())
    copied.forEach((page) => out.addPage(page))
  }
  return out.save()
}

export async function exportSelectedPages(workingPdfBytes: Uint8Array, indices: number[]): Promise<Uint8Array> {
  const source = await PDFDocument.load(workingPdfBytes)
  const out = await PDFDocument.create()
  if (indices.length === 0) {
    throw new Error('No pages selected for export.')
  }
  const normalized = [...new Set(indices)].filter((index) => index >= 0 && index < source.getPageCount())
  const copied = await out.copyPages(source, normalized)
  copied.forEach((page) => out.addPage(page))
  return out.save()
}

export async function flattenAnnotations(
  workingPdfBytes: Uint8Array,
  pageModels: PageModel[],
  annotationsByPage: Record<string, Annotation[]>,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(workingPdfBytes)
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  for (let pageIndex = 0; pageIndex < pageModels.length; pageIndex += 1) {
    const model = pageModels[pageIndex]
    const page = pdf.getPage(pageIndex)
    const width = page.getWidth()
    const height = page.getHeight()
    const annotations = annotationsByPage[model.pageId] ?? []

    for (const annotation of annotations) {
      const x = annotation.rect.x * width
      const rectY = annotation.rect.y * height
      const rectWidth = annotation.rect.width * width
      const rectHeight = annotation.rect.height * height
      const yBottom = height - rectY - rectHeight

      if (annotation.type === 'highlight') {
        const color = hexToRgb(annotation.color)
        page.drawRectangle({
          x,
          y: yBottom,
          width: rectWidth,
          height: rectHeight,
          color: rgb(color.r, color.g, color.b),
          opacity: annotation.opacity,
          borderWidth: 0,
        })
      }

      if (annotation.type === 'whiteoutRect') {
        const color = hexToRgb(annotation.fill)
        page.drawRectangle({
          x,
          y: yBottom,
          width: rectWidth,
          height: rectHeight,
          color: rgb(color.r, color.g, color.b),
          borderWidth: 0,
        })
      }

      if (annotation.type === 'textOverlay' || annotation.type === 'replacementText') {
        const color = hexToRgb(annotation.color)
        const drawFont = annotation.bold ? fontBold : font
        page.drawText(annotation.text, {
          x: x + 2,
          y: yBottom + Math.max(2, rectHeight - annotation.fontSize - 2),
          size: annotation.fontSize,
          color: rgb(color.r, color.g, color.b),
          font: drawFont,
          maxWidth: Math.max(1, rectWidth - 4),
        })
      }
    }
  }

  return pdf.save()
}
