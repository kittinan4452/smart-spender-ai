import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { syncGmailForUser } from '@/lib/gmail/sync'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const month = Number(body?.month)
  const year = Number(body?.year)
  const target = Number.isInteger(month) && Number.isInteger(year) ? { month, year } : undefined

  try {
    const result = await syncGmailForUser(session.user.id, target)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
