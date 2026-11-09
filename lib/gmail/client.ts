'use client'

import Swal from 'sweetalert2'
import { toast } from 'sonner'
import { emitDataChanged } from '@/lib/hooks/useDataRefresh'

const SNOOZE_KEY = 'gmail-reconnect-snoozed'

function isSnoozed() {
  try {
    return sessionStorage.getItem(SNOOZE_KEY) === '1'
  } catch {
    return false
  }
}

function snooze() {
  try {
    sessionStorage.setItem(SNOOZE_KEY, '1')
  } catch {}
}

/** Sends the user through Google consent and back to the current page (which then auto-syncs). */
export function startGmailReconnect() {
  const returnTo = window.location.pathname + window.location.search
  window.location.href = `/api/gmail/connect?returnTo=${encodeURIComponent(returnTo)}`
}

/**
 * Popup asking the user to reconnect Gmail. `auto` popups (shown on page load) respect a per-tab
 * snooze so "ไว้ทีหลัง" doesn't re-open it on every reload; user-triggered ones always show.
 */
export async function promptGmailReconnect({ auto = false }: { auto?: boolean } = {}) {
  if (auto && isSnoozed()) return
  const result = await Swal.fire({
    title: 'การเชื่อมต่อ Gmail หลุด',
    html:
      'สิทธิ์เข้าถึง Gmail หมดอายุแล้ว ระบบจึงดึงรายการจากอีเมลไม่ได้<br><br>' +
      'กด <b>เชื่อมต่อใหม่</b> แล้วยืนยันบัญชี Google — ระบบจะ<b>ซิงค์รายการที่ขาดไปให้อัตโนมัติ</b>',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'เชื่อมต่อใหม่',
    cancelButtonText: 'ไว้ทีหลัง',
    confirmButtonColor: '#6366f1',
    cancelButtonColor: '#6b7280',
  })
  if (result.isConfirmed) startGmailReconnect()
  else snooze()
}

/** Syncs everything missed since the last successful sync, with toast feedback. */
export async function runGmailCatchUpSync(onReview?: () => void) {
  const id = toast.loading('กำลังซิงค์รายการจากอีเมล...')
  try {
    const res = await fetch('/api/gmail/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ catchUp: true }),
    })
    const data = await res.json()
    if (data.needsReconnect) {
      toast.dismiss(id)
      promptGmailReconnect()
      return
    }
    if (!data.ok) throw new Error(data.error || 'ซิงค์ไม่สำเร็จ')

    emitDataChanged()
    if (data.created > 0) {
      toast.success(`ตรวจพบ ${data.created} รายการใหม่จากอีเมล`, {
        id,
        description: 'รอการยืนยันก่อนบันทึก',
        action: onReview ? { label: 'ตรวจสอบ', onClick: onReview } : undefined,
      })
    } else {
      toast.success('ซิงค์อีเมลแล้ว ไม่มีรายการใหม่', { id })
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'ซิงค์ไม่สำเร็จ', { id })
  }
}

export class GmailReconnectNeededError extends Error {
  constructor() {
    super('การเชื่อมต่อ Gmail หมดอายุ')
    this.name = 'GmailReconnectNeededError'
  }
}

export interface MonthSyncTotals {
  found: number
  created: number
}

/**
 * Sync one Thai month, following nextPageToken across as many short requests as needed.
 * `onProgress` fires after every request with running totals for this month.
 */
export async function syncGmailMonth(
  ym: { year: number; month: number },
  opts: { signal?: AbortSignal; onProgress?: (t: MonthSyncTotals) => void } = {}
): Promise<MonthSyncTotals> {
  const totals: MonthSyncTotals = { found: 0, created: 0 }
  let pageToken: string | undefined
  do {
    const res = await fetch('/api/gmail/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: ym.month, year: ym.year, pageToken }),
      signal: opts.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (data.needsReconnect) throw new GmailReconnectNeededError()
    if (!data.ok) throw new Error(data.error || 'ซิงค์ไม่สำเร็จ')
    totals.found += data.found ?? 0
    totals.created += data.created ?? 0
    opts.onProgress?.({ ...totals })
    pageToken = data.nextPageToken
  } while (pageToken && !opts.signal?.aborted)
  return totals
}
