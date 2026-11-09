'use client'

import { useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { promptGmailReconnect, runGmailCatchUpSync } from '@/lib/gmail/client'

/**
 * Mounted once in the app layout:
 * - after returning from Google consent (?gmail=connected) → auto catch-up sync
 * - otherwise, if the stored refresh token is dead → popup asking the user to reconnect
 */
export default function GmailConnectionWatcher() {
  const router = useRouter()
  const params = useParams()
  const locale = (params.locale as string) || 'th'
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const url = new URL(window.location.href)
    const gmailParam = url.searchParams.get('gmail')

    if (gmailParam) {
      // Strip the one-shot param so a reload doesn't re-trigger the sync.
      url.searchParams.delete('gmail')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)

      if (gmailParam === 'connected') {
        runGmailCatchUpSync(() => router.push(`/${locale}/transactions/email-review`))
      } else if (gmailParam === 'error' && !url.pathname.endsWith('/settings')) {
        // Settings shows its own inline message for this.
        toast.error('เชื่อมต่อ Gmail ไม่สำเร็จ ลองใหม่อีกครั้ง')
      }
      return
    }

    fetch('/api/gmail/status')
      .then(r => (r.ok ? r.json() : null))
      .then(status => {
        if (status?.needsReconnect) promptGmailReconnect({ auto: true })
      })
      .catch(() => {})
  }, [router, locale])

  return null
}
