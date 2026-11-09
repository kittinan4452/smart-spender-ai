import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { mapPool, syncGmailDaily } from '@/lib/gmail/sync'
import { RECONNECT_REQUIRED } from '@/lib/gmail/oauth'

export const maxDuration = 300
/** Shared across all users so the whole cron run stays under maxDuration. */
const CRON_BUDGET_MS = 270_000
/**
 * Users synced at the same time. Gmail's quota is per user and sync.ts paces each user separately,
 * so parallel users don't slow each other down — one sequential run would only fit a handful of users.
 */
const USER_CONCURRENCY = 10

interface CronUserResult {
  userId: string
  ok: boolean
  found?: number
  created?: number
  /** false when the scan stopped early (time budget or Gmail rate limit); the next run re-scans it. */
  complete?: boolean
  error?: string
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Accounts whose refresh token is dead can only be fixed by the user reconnecting — skip them.
  const accounts = await prisma.gmailAccount.findMany({
    where: { OR: [{ lastError: null }, { lastError: { not: RECONNECT_REQUIRED } }] },
    select: { userId: true },
  })

  const deadline = Date.now() + CRON_BUDGET_MS
  let started = 0
  const results = await mapPool(accounts, USER_CONCURRENCY, async ({ userId }): Promise<CronUserResult> => {
    const notStarted = accounts.length - started++ // including this user
    const remaining = deadline - Date.now()
    if (remaining <= 0) return { userId, ok: false, error: 'skipped: cron time budget exhausted' }
    try {
      // Fair share: with USER_CONCURRENCY slots and `notStarted` users still to go, each gets about
      // remaining × slots / notStarted (all of it once everyone left fits). Users that finish early leave
      // more time for the rest; anything unfinished is re-scanned by tomorrow's run.
      const budgetMs = remaining * Math.min(1, USER_CONCURRENCY / notStarted)
      const r = await syncGmailDaily(userId, { budgetMs })
      return { userId, ok: true, found: r.found, created: r.created, complete: !r.nextPageToken && !r.retryAfterMs }
    } catch (err) {
      return { userId, ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Vercel's cron view doesn't show the response body; log it so incomplete or failed users are visible.
  console.log('[gmail-cron]', JSON.stringify(results))
  return NextResponse.json({ processed: results.length, results })
}
