import { invoke } from '@tauri-apps/api/core'

export async function pickOpenPdf(): Promise<string | null> {
  return invoke<string | null>('pick_open_pdf')
}

export async function readPdfBytes(path: string): Promise<Uint8Array> {
  const bytes = await invoke<number[]>('read_pdf_bytes', { path })
  return new Uint8Array(bytes)
}

export async function pickSavePdf(defaultName?: string): Promise<string | null> {
  return invoke<string | null>('pick_save_pdf', { defaultName: defaultName ?? null })
}

export async function safeWritePdf(targetPath: string, pdfBytes: Uint8Array, createBackup: boolean): Promise<void> {
  await invoke('safe_write_pdf', {
    targetPath,
    pdfBytes: Array.from(pdfBytes),
    createBackup,
  })
}

export async function listRecentFiles(): Promise<string[]> {
  return invoke<string[]>('list_recent_files')
}

export async function storeRecentFile(path: string): Promise<void> {
  await invoke('store_recent_file', { path })
}
