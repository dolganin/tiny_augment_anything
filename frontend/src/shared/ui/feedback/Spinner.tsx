import '@/shared/ui/feedback/spinner.css'

type SpinnerProps = {
  label?: string
  tone?: 'default' | 'diffusion'
}

export function Spinner({ label, tone = 'default' }: SpinnerProps) {
  return (
    <div className={`spinner spinner--${tone}`}>
      <span className="spinner__ring" />
      {label ? <p className="spinner__label">{label}</p> : null}
    </div>
  )
}
