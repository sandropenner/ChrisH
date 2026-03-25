import { useEditorStore } from '../store/useEditorStore'

export function RecoveryBanner() {
  const available = useEditorStore((s) => s.recoveryAvailable)
  const restore = useEditorStore((s) => s.restoreRecoverySession)
  const dismiss = useEditorStore((s) => s.dismissRecovery)

  if (!available) {
    return null
  }

  return (
    <div className="recovery-banner">
      <p>Unsaved session recovery is available.</p>
      <div className="row">
        <button type="button" className="tool-btn" onClick={() => restore()}>
          Restore Session
        </button>
        <button type="button" className="tool-btn" onClick={() => dismiss()}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
