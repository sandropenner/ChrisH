# Chris PDF

Chris PDF is a Windows-first desktop PDF editor/viewer built with Tauri v2, React, TypeScript, and Rust.
It is a local/offline-first alternative for common Acrobat-style workflows:

- Open/view PDFs with zoom, fit modes, page navigation, and thumbnail sidebar
- Search text across pages with next/previous navigation and active match highlight
- Add text highlights, text overlays, and whiteout rectangles
- Reorder, rotate, delete, merge/import, and export selected pages
- Save and Save As using a safe write pipeline (temp file + replace + rolling backup)
- Undo/redo command history
- Dark mode and keyboard shortcuts
- Nice-to-have features included: recent files and multi-tab support

## Stack and why

- **Tauri v2 (Rust + WebView)**: lightweight desktop runtime, strong native integration
- **React + TypeScript + Vite**: fast iteration and strong typing
- **Tailwind CSS**: utility styling with custom design tokens/layout
- **PDF.js (via react-pdf)**: reliable rendering, text layer, selection/search support
- **pdf-lib**: page operations and flattening annotations into saved output
- **Zustand**: clear state store for document, tools, history, and UI state
- **@dnd-kit**: thumbnail drag-and-drop reordering
- **react-hotkeys-hook**: keyboard shortcuts

## Prerequisites (Windows)

Install once:

```powershell
winget install --id Rustlang.Rustup -e --accept-package-agreements --accept-source-agreements
rustup default stable-x86_64-pc-windows-msvc
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-package-agreements --accept-source-agreements
winget install --id Microsoft.EdgeWebView2Runtime -e --accept-package-agreements --accept-source-agreements
```

## Setup

From project root:

```powershell
npm install
```

## Run in development

```powershell
npm run tauri dev
```

## Build for Windows

```powershell
npm run tauri build -- --debug
```

Release build:

```powershell
npm run tauri build
```

## Architecture overview

Core modules:

- `src/store/useEditorStore.ts`: global typed state, command history, document actions
- `src/lib/pdf/pageOps.ts`: page operations + annotation flattening with pdf-lib
- `src/lib/pdf/search.ts`: text search index/matches over PDF.js text content
- `src/components/*`: toolbar/sidebar/viewer/search/tab shell UI
- `src-tauri/src/commands.rs`: Tauri command interface exposed to frontend
- `src-tauri/src/save_pipeline.rs`: safe save temp/replace/rolling-backup logic
- `src-tauri/src/recent_files.rs`: persisted recent-files list

Separation of concerns:

1. Rendering/viewing: React + PDF.js
2. Annotation tools: overlay models and editor interactions
3. Page operations: pdf-lib compose/rebuild pipeline
4. Persistence: frontend composes output bytes, Rust writes safely
5. State/history: Zustand + snapshot command history (`undo`/`redo`)

## Public Rust command interfaces

Implemented commands:

1. `pick_open_pdf() -> Option<String>`
2. `read_pdf_bytes(path: String) -> Result<Vec<u8>, String>`
3. `pick_save_pdf(default_name: Option<String>) -> Option<String>`
4. `safe_write_pdf(target_path: String, pdf_bytes: Vec<u8>, create_backup: bool) -> Result<(), String>`
5. `list_recent_files() -> Result<Vec<String>, String>`
6. `store_recent_file(path: String) -> Result<(), String>`

## PDF compatibility / encrypted files

- Opening/viewing is PDF.js-first. The app opens from raw bytes and lets PDF.js load/render first.
- Edit/save/export/merge/page-output operations use pdf-lib.
- If PDF.js can render a file but pdf-lib cannot open it (for example encryption/password restrictions), the app keeps the file open in **view-only** mode and disables editing/saving actions.
- The toolbar and transient status toast show a clear view-only message instead of a generic open failure.
- On successful save/save-as, overlay annotations are flattened into the output PDF and then cleared from editable overlay state to avoid duplicate re-application on later saves.
- Overwrite-save keeps a single rolling `*.bak.pdf` backup per source file to reduce backup spam.

## Keyboard shortcuts

- `Ctrl+O` Open
- `Ctrl+S` Save
- `Ctrl+Shift+S` Save As
- `Ctrl+Z` Undo
- `Ctrl+Y` Redo
- `Ctrl+F` Search
- `Delete` Delete selected pages (or current page when nothing is selected)
- `Ctrl++` / `Ctrl+-` Zoom
- `Ctrl + Mouse Wheel` Zoom

## Completed phased checklist

- [x] **Phase 0** prerequisites/scaffold in root + Tailwind + Tauri + README baseline
- [x] **Phase 1** open/view core + zoom + fit + nav + thumbnails
- [x] **Phase 2** search + highlight + dark mode + shortcuts
- [x] **Phase 3** text overlays + whiteout workflow
- [x] **Phase 4** sidebar drag reorder + multi-select + rotate/delete/export
- [x] **Phase 5** merge/import + pdf-lib compose + save/save-as safe pipeline
- [x] **Phase 6** undo/redo + unsaved prompts + error handling + docs polish
- [x] **Phase 7** recent files + multi-tab + annotation list/sidebar + basic stamp + page label/status improvements

## Test status

Executed successfully:

- `npm run build` (TypeScript + Vite production build)
- `npm test` (Vitest unit tests)
- `cargo test` in `src-tauri`
- `npm run tauri build -- --debug` (native build + installers)

## Known limitations

- Whiteout/Cover & Replace is an overlay workflow; it does **not** guarantee true underlying text removal/redaction in all PDFs.
- Highlight/search rectangle mapping is approximate for some complex fonts/transforms.
- Text overlays support drag/resize in viewer; rich text editing is intentionally minimal for stability.
- Large PDFs can create big frontend bundles and higher memory use during flattening.
- Advanced OCR/signatures/forms content editing are intentionally out of scope for v1.

## Roadmap

Potential next improvements:

- Native PDF annotation object output where stable
- More advanced text box editing (resize handles, alignment, font families)
- Faster lazy-loading/rendering for very large documents
- Better chunk splitting for smaller JS bundle size

## Notes on delete-text behavior

"Delete text" is implemented as:

- whiteout/redaction rectangle drawn over content
- flattened into saved/exported output

This is intentionally labeled as **Whiteout** and is not claimed as guaranteed true in-place embedded text editing.
