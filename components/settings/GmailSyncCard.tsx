'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { emitDataChanged } from '@/lib/hooks/useDataRefresh'

interface GmailStatus {
  connected: boolean
  lastSyncedAt: string | null
  lastError: string | null
}

export default function GmailSyncCard() {
  const params = useParams()
  const locale = params.locale as string
  const [status, setStatus] = useState<GmailStatus | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    const gmailParam = new URLSearchParams(window.location.search).get('gmail')
    if (gmailParam === 'connected') return 'เชื่อมต่อ Gmail สำเร็จ'
    if (gmailParam === 'error') return 'เชื่อมต่อ Gmail ไม่สำเร็จ ลองใหม่อีกครั้ง'
    return null
  })

  const loadStatus = useCallback(() => {
    fetch('/api/gmail/status').then(r => r.ok ? r.json() : null).then(d => d && setStatus(d))
  }, [])

  const loadPendingCount = useCallback(() => {
    fetch('/api/gmail/candidates')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setPendingCount(Array.isArray(d) ? d.length : 0))
  }, [])

  useEffect(() => {
    loadStatus()
    loadPendingCount()
  }, [loadStatus, loadPendingCount])

  async function handleSync() {
    setSyncing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/gmail/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setMessage(`ตรวจพบ ${data.created} รายการใหม่ (สแกน ${data.found} อีเมล)`)
        loadStatus()
        loadPendingCount()
        emitDataChanged()
      } else {
        setMessage(data.error || 'ซิงค์ไม่สำเร็จ')
      }
    } finally {
      setSyncing(false)
    }
  }

  async function handleDisconnect() {
    await fetch('/api/gmail/disconnect', { method: 'POST' })
    setPendingCount(0)
    loadStatus()
  }

  if (!status) return null

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
      <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">📧 เชื่อมต่ออีเมล (Gmail)</h2>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
        ตรวจจับรายรับ/รายจ่ายจากอีเมลแจ้งเตือนธนาคาร/e-wallet อัตโนมัติ (เฉพาะเดือนปัจจุบัน)
      </p>

      {message && (
        <div className="mb-4 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-sm text-indigo-700 dark:text-indigo-300">
          {message}
        </div>
      )}

      {status.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300">✅ เชื่อมต่อแล้ว</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              ซิงค์ล่าสุด: {status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString('th-TH') : 'ยังไม่เคย'}
            </p>
            {status.lastError && <p className="text-xs text-red-500 mt-0.5">⚠️ {status.lastError}</p>}
            {pendingCount > 0 && (
              <Link
                href={`/${locale}/transactions/email-review`}
                className="inline-block text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-1"
              >
                ตรวจพบจากอีเมล {pendingCount} รายการ รอตรวจสอบ →
              </Link>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors"
            >
              {syncing ? 'กำลังซิงค์...' : 'ซิงค์ตอนนี้'}
            </button>
            <button
              onClick={handleDisconnect}
              className="border border-gray-300 dark:border-gray-700 text-sm font-medium rounded-xl px-4 py-2 text-gray-600 dark:text-gray-300 transition-colors"
            >
              ยกเลิกการเชื่อมต่อ
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- must be a real navigation so the API route's redirect to Google's consent screen works */}
          <a
            href="/api/gmail/connect"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors"
          >
            เชื่อมต่อ Gmail
          </a>
        </>
      )}
    </div>
  )
}
