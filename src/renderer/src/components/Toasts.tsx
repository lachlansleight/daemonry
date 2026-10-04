import { useDaemonry } from '../store'

export function Toasts(): React.JSX.Element | null {
  const { toasts, dismiss } = useDaemonry()
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-[16px] right-[16px] flex flex-col gap-[8px] w-[340px] z-10">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          title="Dismiss"
          className="no-drag flex items-start gap-[10px] text-left px-[12px] py-[10px] rounded-[8px] bg-surface-2 border border-line shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
        >
          <span className="mt-[5px] w-[8px] h-[8px] shrink-0 rounded-[999px] bg-bad" />
          <span className="text-[12px] text-ink-0 leading-[16px] break-words min-w-[0px]">{t.text}</span>
        </button>
      ))}
    </div>
  )
}
