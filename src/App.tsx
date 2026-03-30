import { useEffect } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirm } from '@tauri-apps/plugin-dialog'
import { useHotkeys } from 'react-hotkeys-hook'

import 'react-pdf/dist/Page/TextLayer.css'
import './lib/pdf/worker'

import { DocumentViewer } from './components/DocumentViewer'
import { OrganizerView } from './components/OrganizerView'
import { TabsBar } from './components/TabsBar'
import { ThumbnailSidebar } from './components/ThumbnailSidebar'
import { Toolbar } from './components/Toolbar'
import { useEditorStore } from './store/useEditorStore'

function App() {
  const initialize = useEditorStore((s) => s.initialize)
  const openPdf = useEditorStore((s) => s.openPdf)
  const save = useEditorStore((s) => s.save)
  const saveAs = useEditorStore((s) => s.saveAs)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const runSearch = useEditorStore((s) => s.runSearch)
  const zoomIn = useEditorStore((s) => s.zoomIn)
  const zoomOut = useEditorStore((s) => s.zoomOut)
  const deleteSelectedPages = useEditorStore((s) => s.deleteSelectedPages)
  const organizerMode = useEditorStore((s) => s.organizerMode)
  const leftSidebarCollapsed = useEditorStore((s) => s.leftSidebarCollapsed)
  const tabs = useEditorStore((s) => s.tabs)
  const statusMessage = useEditorStore((s) => s.statusMessage)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (isTauri()) return
    const handler = (event: BeforeUnloadEvent) => {
      if (tabs.some((tab) => tab.document.dirty)) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [tabs])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | null = null

    const setupClosePrompt = async () => {
      try {
        unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
          const hasDirtyTabs = useEditorStore.getState().tabs.some((tab) => tab.document.dirty)
          if (!hasDirtyTabs) return
          const confirmed = await confirm('You have unsaved changes. Are you sure you want to close without saving?', {
            title: 'Unsaved Changes',
            kind: 'warning',
            okLabel: 'Close Without Saving',
            cancelLabel: 'Cancel',
          })
          if (!confirmed) {
            event.preventDefault()
          }
        })
      } catch (error) {
        console.error('[App:onCloseRequested]', error)
      }
    }

    void setupClosePrompt()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [])

  useHotkeys('ctrl+o', (event) => {
    event.preventDefault()
    openPdf(true)
  })

  useHotkeys('ctrl+s', (event) => {
    event.preventDefault()
    save()
  })

  useHotkeys('ctrl+shift+s', (event) => {
    event.preventDefault()
    saveAs()
  })

  useHotkeys('ctrl+z', (event) => {
    event.preventDefault()
    undo()
  })

  useHotkeys('ctrl+y', (event) => {
    event.preventDefault()
    redo()
  })

  useHotkeys('ctrl+f', (event) => {
    event.preventDefault()
    const term = window.prompt('Search text in PDF:', '')
    if (term !== null) {
      runSearch(term)
    }
  })

  useHotkeys('ctrl+=,ctrl+plus', (event) => {
    event.preventDefault()
    zoomIn()
  })

  useHotkeys('ctrl+-', (event) => {
    event.preventDefault()
    zoomOut()
  })

  useHotkeys('del', (event) => {
    if (!organizerMode) return
    event.preventDefault()
    deleteSelectedPages()
  })

  return (
    <div className="app-shell">
      <TabsBar />
      <Toolbar />

      <div className={`main-layout ${leftSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {!leftSidebarCollapsed ? <ThumbnailSidebar /> : null}
        <main className="center-pane">{organizerMode ? <OrganizerView /> : <DocumentViewer />}</main>
      </div>
      {statusMessage ? <div className="status-toast">{statusMessage}</div> : null}
    </div>
  )
}

export default App
