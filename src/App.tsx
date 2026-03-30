import { useEffect, useRef } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { confirm } from '@tauri-apps/plugin-dialog'
import { useHotkeys } from 'react-hotkeys-hook'

import 'react-pdf/dist/Page/TextLayer.css'
import './lib/pdf/worker'

import { DocumentViewer } from './components/DocumentViewer'
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
  const setToolPopover = useEditorStore((s) => s.setToolPopover)
  const zoomIn = useEditorStore((s) => s.zoomIn)
  const zoomOut = useEditorStore((s) => s.zoomOut)
  const deleteSelectedPages = useEditorStore((s) => s.deleteSelectedPages)
  const leftSidebarCollapsed = useEditorStore((s) => s.leftSidebarCollapsed)
  const tabs = useEditorStore((s) => s.tabs)
  const statusMessage = useEditorStore((s) => s.statusMessage)
  const allowWindowCloseRef = useRef(false)

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
    let disposed = false
    let unlisten: (() => void) | null = null
    const appWindow = getCurrentWindow()

    const setupClosePrompt = async () => {
      try {
        const closeUnlisten = await appWindow.onCloseRequested(async (event) => {
          if (allowWindowCloseRef.current) {
            allowWindowCloseRef.current = false
            return
          }
          const hasDirtyTabs = useEditorStore.getState().tabs.some((tab) => tab.document.dirty)
          if (!hasDirtyTabs) return
          event.preventDefault()
          const confirmed = await confirm('You have unsaved changes. Are you sure you want to close without saving?', {
            title: 'Unsaved Changes',
            kind: 'warning',
            okLabel: 'Close Without Saving',
            cancelLabel: 'Cancel',
          })
          if (confirmed) {
            allowWindowCloseRef.current = true
            await appWindow.close()
          }
        })
        if (disposed) {
          closeUnlisten()
          return
        }
        unlisten = closeUnlisten
      } catch (error) {
        console.error('[App:onCloseRequested]', error)
      }
    }

    void setupClosePrompt()

    return () => {
      disposed = true
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
    setToolPopover('search')
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
    event.preventDefault()
    deleteSelectedPages()
  })

  return (
    <div className="app-shell">
      <TabsBar />
      <Toolbar />

      <div className={`main-layout ${leftSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        {!leftSidebarCollapsed ? <ThumbnailSidebar /> : null}
        <main className="center-pane">
          <DocumentViewer />
        </main>
      </div>
      {statusMessage ? <div className="status-toast">{statusMessage}</div> : null}
    </div>
  )
}

export default App
