import { PropsWithChildren } from 'react'
import '@/shared/ui/feedback/modal.css'

type ModalProps = PropsWithChildren<{
  open: boolean
  title: string
  tone?: 'default' | 'error'
  onClose: () => void
}>

export function Modal({ open, title, tone = 'default', onClose, children }: ModalProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-layer" role="presentation">
      <div className="modal-backdrop" onClick={onClose} />
      <section
        aria-labelledby="modal-title"
        aria-modal="true"
        className={`modal modal--${tone}`}
        role="dialog"
      >
        <header className="modal__header">
          <h3 className="modal__title" id="modal-title">
            {title}
          </h3>
          <button className="modal__close" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <div className="modal__content">{children}</div>
      </section>
    </div>
  )
}
