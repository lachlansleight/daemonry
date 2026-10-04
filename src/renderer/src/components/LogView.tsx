import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LOG_TAIL_LINES, type AppId, type LogKind, type LogLine } from '@shared/types'
import { api } from '../api'

const KIND_CLASS: Record<LogKind, string> = {
  out: 'text-ink-1',
  err: 'text-ink-0',
  sys: 'text-accent/80',
}

/** Live tail of one app's output. Follows the end until the user scrolls up. */
export function LogView({ id, onCount }: { id: AppId; onCount?: (count: number) => void }): React.JSX.Element {
  const [lines, setLines] = useState<LogLine[]>([])
  const [follow, setFollow] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const refetch = useCallback(() => {
    void api.getLogTail(id).then(setLines)
  }, [id])

  useEffect(() => {
    setLines([])
    setFollow(true)
    refetch()
    const off = api.onLogLines((lineId, incoming) => {
      if (lineId !== id) return
      setLines((prev) => {
        const next = prev.concat(incoming)
        return next.length > LOG_TAIL_LINES ? next.slice(next.length - LOG_TAIL_LINES) : next
      })
    })
    // Hidden windows are not streamed to; catch up when shown again.
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      off()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [id, refetch])

  useEffect(() => onCount?.(lines.length), [lines.length, onCount])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [lines, follow])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8
    if (atBottom !== follow) setFollow(atBottom)
  }

  return (
    <div className="relative rounded-[8px] border border-line bg-surface-1 overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-[360px] overflow-auto px-[14px] py-[10px] font-mono text-[12px] leading-[18px] whitespace-pre"
      >
        {lines.map((line) => (
          <div key={line.seq} className={KIND_CLASS[line.kind]} title={new Date(line.t).toLocaleTimeString()}>
            {line.text || ' '}
          </div>
        ))}
      </div>
      {!follow && (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="no-drag absolute bottom-[10px] right-[14px] h-[24px] px-[10px] rounded-[999px] bg-surface-3 border border-line-strong text-[11px] text-ink-0 hover:bg-line-strong transition-colors"
        >
          Jump to latest
        </button>
      )}
    </div>
  )
}
