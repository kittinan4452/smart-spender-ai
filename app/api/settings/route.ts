import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, language: true, currency: true, aiProvider: true, aiModel: true, aiApiKey: true },
  })

  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, language, currency, aiProvider, aiModel, aiApiKey } = body

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: { name, language, currency, aiProvider, aiModel, aiApiKey },
    select: { name: true, email: true, language: true, currency: true, aiProvider: true, aiModel: true },
  })

  return NextResponse.json(updated)
}
