'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import EmailCandidatesReview from '@/components/gmail/EmailCandidatesReview'

export default function EmailReviewPage() {
  const params = useParams()
  const locale = params.locale as string
  const [monthOffset, setMonthOffset] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const { month, year, monthLabel } = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + monthOffset)
    return {
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      monthLabel: locale === 'th'
        ? format(d, 'MMMM yyyy', { locale: th })
        : format(d, 'MMMM yyyy'),
    }
  }, [monthOffset, locale])

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/gmail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year }),
      })
      const data = await res.json()
      if (data.ok) {
        setMessage(`ตรวจพบ ${data.created} รายการใหม่ (สแกน ${data.found} อีเมล)`)
        setReloadToken(t => t + 1)
      } else {
        setMessage(data.error || 'ซิงค์ไม่สำเร็จ')
      }
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Link
          href={`/${locale}/transactions`}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="back"
        >
          ←
        </Link>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">📧 ตรวจพบจากอีเมล</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 ml-7">
        รายการที่ระบบตรวจพบจากอีเมลแจ้งเตือนธุรกรรม รอการยืนยันก่อนบันทึกเป็นรายการจริง
      </p>

      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-xl px-2 py-1.5 mb-4 border border-gray-100 dark:border-gray-800">
        <button
          onClick={() => setMonthOffset(o => o - 1)}
          className="px-3 py-1.5 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          aria-label="previous month"
        >
          ←
        </button>
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-800 dark:text-gray-200">{monthLabel}</span>
          {monthOffset !== 0 && (
            <button
              onClick={() => setMonthOffset(0)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {locale === 'th' ? 'เดือนนี้' : 'This month'}
            </button>
          )}
        </div>
        <button
          onClick={() => setMonthOffset(o => Math.min(o + 1, 0))}
          disabled={monthOffset >= 0}
          className="px-3 py-1.5 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          aria-label="next month"
        >
          →
        </button>
      </div>

      <button
        onClick={handleSync}
        disabled={syncing}
        className="w-full mb-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-2.5 transition-colors"
      >
        {syncing ? 'กำลังซิงค์...' : `ซิงค์เดือน ${monthLabel}`}
      </button>

      {message && (
        <div className="mb-4 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-sm text-indigo-700 dark:text-indigo-300">
          {message}
        </div>
      )}

      <EmailCandidatesReview month={month} year={year} reloadToken={reloadToken} />
    </div>
  )
}
