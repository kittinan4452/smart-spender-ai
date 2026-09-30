import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { syncGmailForUser } from '@/lib/gmail/sync'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accounts = await prisma.gmailAccount.findMany({ select: { userId: true } })
  const results: { userId: string; ok: boolean; found?: number; created?: number; error?: string }[] = []

  for (const { userId } of accounts) {
    try {
      const r = await syncGmailForUser(userId)
      results.push({ userId, ok: true, ...r })
    } catch (err) {
      results.push({ userId, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
