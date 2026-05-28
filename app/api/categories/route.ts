import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const categories = await prisma.category.findMany({
    where: { OR: [{ isDefault: true }, { userId: session.user.id }] },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })

  return NextResponse.json(categories)
}
