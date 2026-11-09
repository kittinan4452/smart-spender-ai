'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { emitDataChanged } from '@/lib/hooks/useDataRefresh'
import { GmailReconnectNeededError, promptGmailReconnect, syncGmailMonth } from '@/lib/gmail/client'
import { addMonths, currentBangkokMonth, type YearMonth } from '@/lib/gmail/time'

const RANGE_OPTIONS = [3, 6, 12] as const

const monthLabel = ({ year, month }: YearMonth) =>
  new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })

interface Progress {
  done: number
  total: number
  current: YearMonth | null
  found: number
  created: number
}

/**
 * Backfill several months of Gmail, newest first, one short request at a time so it never hits the
 * serverless time limit. Safe to stop and restart: already-scanned notifications are skipped.
 */
export default function GmailBackfill({ onFinished }: { onFinished?: () => void }) {
  const router = useRouter()
  const locale = (useParams().locale as string) || 'th'
  const [months, setMonths] = useState<(typeof RANGE_OPTIONS)[number]>(12)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Warn before closing the tab mid-backfill (nothing breaks, but the run stops).
  useEffect(() => {
    if (!running) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [running])

  useEffect(() => () => abortRef.current?.abort(), [])

  async function start() {
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)

    const now = currentBangkokMonth()
    const targets = Array.from({ length: months }, (_, i) => addMonths(now, -i))
    const p: Progress = { done: 0, total: targets.length, current: null, found: 0, created: 0 }
    setProgress({ ...p })

    let stoppedEarly = false
    try {
      for (const ym of targets) {
        if (ctrl.signal.aborted) {
          stoppedEarly = true
          break
        }
        p.current = ym
        setProgress({ ...p })
        const base = { found: p.found, created: p.created }
        await syncGmailMonth(ym, {
          signal: ctrl.signal,
          onProgress: t => setProgress({ ...p, found: base.found + t.found, created: base.created + t.created }),
        }).then(t => {
          p.found = base.found + t.found
          p.created = base.created + t.created
        })
        p.done++
        setProgress({ ...p })
      }
      if (ctrl.signal.aborted) stoppedEarly = true
    } catch (err) {
      if (err instanceof GmailReconnectNeededError) {
        promptGmailReconnect()
        stoppedEarly = true
      } else if (ctrl.signal.aborted) {
        stoppedEarly = true
      } else {
        toast.error(err instanceof Error ? err.message : 'ซิงค์ไม่สำเร็จ')
        stoppedEarly = true
      }
    } finally {
      setRunning(false)
      abortRef.current = null
      p.current = null
      setProgress({ ...p })
    }

    emitDataChanged()
    onFinished?.()
    const summary = `สแกน ${p.found.toLocaleString()} อีเมล · พบ ${p.created.toLocaleString()} รายการใหม่`
    const review = p.created
      ? { label: 'ตรวจสอบ', onClick: () => router.push(`/${locale}/transactions/email-review`) }
      : undefined
    if (stoppedEarly) {
      toast.info(`หยุดที่ ${p.done}/${p.total} เดือน`, { description: `${summary} — กดเริ่มใหม่ได้ ระบบจะข้ามอีเมลที่ทำไปแล้ว`, action: review })
    } else {
      toast.success(`ซิงค์ย้อนหลัง ${p.total} เดือนเสร็จแล้ว`, { description: summary, action: review, duration: 10000 })
    }
  }

  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">ซิงค์ย้อนหลัง</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">ดึงรายการจากอีเมลเก่า ทุกรายการต้องยืนยันก่อนบันทึก</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={months}
            onChange={e => setMonths(Number(e.target.value) as (typeof RANGE_OPTIONS)[number])}
            disabled={running}
            className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-700 dark:text-gray-300 disabled:opacity-50"
            aria-label="จำนวนเดือน"
          >
            {RANGE_OPTIONS.map(n => (
              <option key={n} value={n}>
                {n === 12 ? '1 ปี' : `${n} เดือน`}
              </option>
            ))}
          </select>
          {running ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="border border-gray-300 dark:border-gray-700 text-sm font-medium rounded-xl px-4 py-2 text-gray-600 dark:text-gray-300 transition-colors"
            >
              หยุด
            </button>
          ) : (
            <button
              onClick={start}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors"
            >
              เริ่ม
            </button>
          )}
        </div>
      </div>

      {progress && (
        <div className="mt-4" aria-live="polite">
          <div
            className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${running ? 'bg-indigo-500' : 'bg-green-500'}`}
              style={{ width: `${Math.max(pct, running ? 3 : 0)}%` }}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>
              {running && progress.current
                ? `กำลังสแกน ${monthLabel(progress.current)} · ${progress.done}/${progress.total} เดือน`
                : `${progress.done}/${progress.total} เดือน`}
            </span>
            <span className="tabular-nums">
              สแกน {progress.found.toLocaleString()} อีเมล · พบ{' '}
              <b className="text-indigo-600 dark:text-indigo-400">{progress.created.toLocaleString()}</b> รายการใหม่
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
