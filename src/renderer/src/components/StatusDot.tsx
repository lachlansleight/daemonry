import type { AppState } from '@shared/types'

const CLASS: Record<AppState, string> = {
  running: 'bg-ok',
  launching: 'bg-warn animate-pulse',
  stopping: 'bg-warn animate-pulse',
  inactive: 'bg-transparent border border-ink-2',
  crashed: 'bg-bad',
}

export function StatusDot({ state, size = 8 }: { state: AppState; size?: 8 | 10 }): React.JSX.Element {
  const dim = size === 10 ? 'w-[10px] h-[10px]' : 'w-[8px] h-[8px]'
  return <span className={`inline-block shrink-0 rounded-[999px] ${dim} ${CLASS[state]}`} />
}
