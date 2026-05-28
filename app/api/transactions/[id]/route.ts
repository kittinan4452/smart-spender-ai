import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const tx = await prisma.transaction.findFirst({ where: { id, userId: session.user.id } })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.transaction.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const tx = await prisma.transaction.findFirst({ where: { id, userId: session.user.id } })
  if (!tx) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.transaction.update({
    where: { id },
    data: { ...body, date: body.date ? new Date(body.date) : undefined },
    include: { category: true },
  })

  return NextResponse.json(updated)
}
