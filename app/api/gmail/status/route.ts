import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { RECONNECT_REQUIRED } from '@/lib/gmail/oauth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const account = await prisma.gmailAccount.findUnique({
    where: { userId: session.user.id },
    select: { lastSyncedAt: true, lastError: true },
  })

  return NextResponse.json({
    connected: !!account,
    lastSyncedAt: account?.lastSyncedAt ?? null,
    lastError: account?.lastError === RECONNECT_REQUIRED ? null : (account?.lastError ?? null),
    needsReconnect: account?.lastError === RECONNECT_REQUIRED,
  })
}
