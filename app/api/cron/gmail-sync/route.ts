import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { syncGmailForUser } from '@/lib/gmail/sync'
import { RECONNECT_REQUIRED } from '@/lib/gmail/oauth'

export const maxDuration = 300
/** Shared across all users so the whole cron run stays under maxDuration. */
const CRON_BUDGET_MS = 270_000

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
  const results: { userId: string; ok: boolean; found?: number; created?: number; error?: string }[] = []

  const deadline = Date.now() + CRON_BUDGET_MS
  for (const { userId } of accounts) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      results.push({ userId, ok: false, error: 'skipped: cron time budget exhausted' })
      continue
    }
    try {
      // Fair share of the remaining time; anything unfinished is picked up by tomorrow's run.
      const r = await syncGmailForUser(userId, undefined, { budgetMs: remaining / Math.max(1, accounts.length - results.length) })
      results.push({ userId, ok: true, ...r })
    } catch (err) {
      results.push({ userId, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
