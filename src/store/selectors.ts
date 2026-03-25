import type { DocumentTab } from '../types/models'
import type { EditorStore } from './useEditorStore'

export function getActiveTab(state: EditorStore): DocumentTab | null {
  if (!state.activeTabId) return null
  return state.tabs.find((tab) => tab.id === state.activeTabId) ?? null
}
