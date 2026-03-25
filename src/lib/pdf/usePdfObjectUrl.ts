import { useEffect, useMemo } from 'react'

export function usePdfObjectUrl(pdfBytes: Uint8Array | null): string | null {
  const objectUrl = useMemo(() => {
    if (!pdfBytes) {
      return null
    }

    // Clone bytes so each viewer gets an isolated backing buffer before worker transfer.
    const blob = new Blob([pdfBytes.slice()], { type: 'application/pdf' })
    return URL.createObjectURL(blob)
  }, [pdfBytes])

  useEffect(() => {
    if (!objectUrl) return
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  return objectUrl
}
