import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  confirmCandidates,
  dismissCandidates,
  restoreCandidates,
  type CandidateOverrides,
} from '@/lib/gmail/candidates'

const MAX_IDS = 500

/**
 * Bulk review actions for email-detected transactions.
 * body: { action: 'confirm' | 'dismiss' | 'restore', ids: string[], overrides?: { [id]: {...} } }
 * 'restore' is the undo for both confirm (deletes the created transactions) and dismiss.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const action = body?.action
  const ids: string[] = Array.isArray(body?.ids)
    ? [...new Set<string>(body.ids.filter((x: unknown): x is string => typeof x === 'string'))]
    : []
  if (ids.length === 0) return NextResponse.json({ error: 'No ids' }, { status: 400 })
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `Too many ids (max ${MAX_IDS})` }, { status: 400 })

  if (action === 'confirm') {
    const overrides =
      body.overrides && typeof body.overrides === 'object' ? (body.overrides as Record<string, CandidateOverrides>) : {}
    const r = await confirmCandidates(userId, ids, overrides)
    return NextResponse.json({ ok: true, confirmed: r.confirmed.length, skipped: r.skipped })
  }
  if (action === 'dismiss') {
    return NextResponse.json({ ok: true, ...(await dismissCandidates(userId, ids)) })
  }
  if (action === 'restore') {
    return NextResponse.json({ ok: true, ...(await restoreCandidates(userId, ids)) })
  }
  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
