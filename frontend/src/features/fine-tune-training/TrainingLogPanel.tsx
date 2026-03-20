import '@/features/fine-tune-training/training-log.css'

type TrainingLogPanelProps = {
  title: string
  logs: string[]
  emptyLabel: string
}

export function TrainingLogPanel({ title, logs, emptyLabel }: TrainingLogPanelProps) {
  return (
    <section className="training-log">
      <header className="training-log__header">
        <h3 className="training-log__title">{title}</h3>
      </header>
      <div className="training-log__content">
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <p className="training-log__line" key={`${index}-${log}`}>
              {log}
            </p>
          ))
        ) : (
          <p className="training-log__empty">{emptyLabel}</p>
        )}
      </div>
    </section>
  )
}
