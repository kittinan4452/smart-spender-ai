import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const schema = z.object({ role: z.enum(['admin', 'member']) })

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (id === session.user.id) {
    return NextResponse.json({ error: 'ไม่สามารถเปลี่ยน role ตัวเองได้' }, { status: 400 })
  }

  const body = schema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id },
    data: { role: body.data.role },
    select: { id: true, name: true, email: true, role: true },
  })

  return NextResponse.json(updated)
}
