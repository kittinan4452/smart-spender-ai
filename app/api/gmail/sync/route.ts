import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncGmailForUser, syncGmailCatchUp } from '@/lib/gmail/sync'
import { GmailReconnectRequiredError } from '@/lib/gmail/oauth'

export const maxDuration = 300

/** Per-request budget for client-driven month syncs: short so the progress UI stays responsive. */
const REQUEST_BUDGET_MS = 45_000

/**
 * body:
 * - { catchUp: true }                       → everything since the last sync (after reconnecting)
 * - { month, year, pageToken? }             → one Thai month; returns nextPageToken if unfinished
 * - {}                                      → current month
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const month = Number(body?.month)
  const year = Number(body?.year)
  const target = Number.isInteger(month) && Number.isInteger(year) && month >= 1 && month <= 12 ? { month, year } : undefined
  const pageToken = typeof body?.pageToken === 'string' ? body.pageToken : undefined

  try {
    const result = body?.catchUp
      ? await syncGmailCatchUp(session.user.id)
      : await syncGmailForUser(session.user.id, target, { pageToken, budgetMs: REQUEST_BUDGET_MS })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    if (err instanceof GmailReconnectRequiredError) {
      return NextResponse.json({ ok: false, needsReconnect: true, error: 'การเชื่อมต่อ Gmail หมดอายุ' }, { status: 409 })
    }
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
