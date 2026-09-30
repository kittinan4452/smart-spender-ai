'use client'

import { useCallback, useEffect, useState } from 'react'
import { emitDataChanged } from '@/lib/hooks/useDataRefresh'

interface Candidate {
  id: string
  type: string
  amount: number
  description: string
  categoryName: string
  confidence: number
}

interface Props {
  month: number
  year: number
  reloadToken?: number
}

export default function EmailCandidatesReview({ month, year, reloadToken }: Props) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)

  const load = useCallback(() => {
    fetch(`/api/gmail/candidates?month=${month}&year=${year}`)
      .then(r => (r.ok ? r.json() : []))
      .then(d => setCandidates(Array.isArray(d) ? d : []))
  }, [month, year])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  async function handle(id: string, action: 'confirm' | 'dismiss') {
    const res = await fetch('/api/gmail/candidates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    if (res.ok) {
      setCandidates(prev => (prev || []).filter(c => c.id !== id))
      if (action === 'confirm') emitDataChanged()
    }
  }

  if (candidates === null) {
    return <div className="text-center py-16 text-gray-400 dark:text-gray-500">กำลังโหลด...</div>
  }

  if (candidates.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <div className="text-4xl mb-3">📭</div>
        ไม่มีรายการที่ตรวจพบจากอีเมลเดือนนี้
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {candidates.map(c => (
        <div
          key={c.id}
          className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800"
        >
          <div>
            <p className="font-medium text-gray-800 dark:text-gray-200">{c.description}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {c.categoryName} · ความมั่นใจ {Math.round(c.confidence * 100)}%
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${c.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
              {c.type === 'income' ? '+' : '-'}฿{c.amount.toLocaleString()}
            </span>
            <button
              onClick={() => handle(c.id, 'confirm')}
              className="text-sm bg-green-600 hover:bg-green-700 text-white rounded-xl px-3 py-2 transition-colors"
            >
              ยืนยัน
            </button>
            <button
              onClick={() => handle(c.id, 'dismiss')}
              className="text-sm border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-500 dark:text-gray-400 transition-colors"
            >
              ไม่ใช่
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
