import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { bangkokMonthBounds } from '@/lib/gmail/time'
import { confirmCandidates, dismissCandidates, listPendingCandidates } from '@/lib/gmail/candidates'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = Number(searchParams.get('month'))
  const year = Number(searchParams.get('year'))
  const range =
    Number.isInteger(month) && Number.isInteger(year) && month >= 1 && month <= 12
      ? bangkokMonthBounds({ year, month })
      : undefined

  return NextResponse.json(await listPendingCandidates(session.user.id, range))
}

/** Single-candidate confirm/dismiss (kept for compatibility; the review UI uses /bulk). */
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({}))
  const { id, action, amount, type, description, categoryId } = body as {
    id?: string
    action?: 'confirm' | 'dismiss'
    amount?: number
    type?: string
    description?: string
    categoryId?: string
  }
  if (typeof id !== 'string') return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  if (action === 'dismiss') {
    const r = await dismissCandidates(userId, [id])
    if (!r.dismissed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'confirm') {
    const r = await confirmCandidates(userId, [id], { [id]: { amount, type, description, categoryId } })
    if (!r.confirmed.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, transactionId: r.confirmed[0].transactionId })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
