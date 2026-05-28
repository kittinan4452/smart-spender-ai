import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { AI_PROVIDERS, hasKey } from '@/lib/ai/providers'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { aiApiKey: true },
  })

  const providers = AI_PROVIDERS.map(p => ({
    ...p,
    available: hasKey(p.id, user?.aiApiKey),
  }))

  return NextResponse.json(providers)
}
