import { useEffect, useMemo } from 'react'

const objectUrlByBytes = new WeakMap<Uint8Array, string>()
const refCountByUrl = new Map<string, number>()

function retainObjectUrl(pdfBytes: Uint8Array): string {
  let objectUrl = objectUrlByBytes.get(pdfBytes)
  if (!objectUrl) {
    const blob = new Blob([pdfBytes.slice()], { type: 'application/pdf' })
    objectUrl = URL.createObjectURL(blob)
    objectUrlByBytes.set(pdfBytes, objectUrl)
    refCountByUrl.set(objectUrl, 0)
  }

  refCountByUrl.set(objectUrl, (refCountByUrl.get(objectUrl) ?? 0) + 1)
  return objectUrl
}

function releaseObjectUrl(pdfBytes: Uint8Array, objectUrl: string): void {
  const refCount = refCountByUrl.get(objectUrl)
  if (!refCount) return
  if (refCount > 1) {
    refCountByUrl.set(objectUrl, refCount - 1)
    return
  }

  refCountByUrl.delete(objectUrl)
  objectUrlByBytes.delete(pdfBytes)
  // Delay revocation slightly to avoid in-flight PDF.js fetch races during remounts.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 500)
}

export function usePdfObjectUrl(pdfBytes: Uint8Array | null): string | null {
  const objectUrl = useMemo(() => {
    if (!pdfBytes) return null
    return retainObjectUrl(pdfBytes)
  }, [pdfBytes])

  useEffect(() => {
    if (!pdfBytes || !objectUrl) return
    return () => {
      releaseObjectUrl(pdfBytes, objectUrl)
    }
  }, [pdfBytes, objectUrl])

  return objectUrl
}
