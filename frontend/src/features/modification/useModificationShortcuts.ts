import { useEffect } from 'react'

type UseModificationShortcutsParams = {
  canApplyArea: boolean
  onApplyArea: () => void
  onClose: () => void
  onMoveSource: (direction: -1 | 1) => void
  onSubmit: () => void
  onUndoPoint: () => void
  open: boolean
}

const isTextField = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

export function useModificationShortcuts({
  canApplyArea,
  onApplyArea,
  onClose,
  onMoveSource,
  onSubmit,
  onUndoPoint,
  open,
}: UseModificationShortcutsParams) {
  useEffect(() => {
    if (!open) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const textFieldFocused = isTextField(event.target)

      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && canApplyArea) {
        event.preventDefault()
        onApplyArea()
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        onUndoPoint()
        return
      }

      if (event.key === 'ArrowLeft' && !textFieldFocused) {
        event.preventDefault()
        onMoveSource(-1)
        return
      }

      if (event.key === 'ArrowRight' && !textFieldFocused) {
        event.preventDefault()
        onMoveSource(1)
        return
      }

      if (event.key === 'Enter' && !event.shiftKey && !textFieldFocused) {
        event.preventDefault()
        onSubmit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canApplyArea, onApplyArea, onClose, onMoveSource, onSubmit, onUndoPoint, open])
}
