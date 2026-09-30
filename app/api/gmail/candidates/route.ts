import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { matchCategory } from '@/lib/categories'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = Number(searchParams.get('month'))
  const year = Number(searchParams.get('year'))

  const where: Record<string, unknown> = { userId: session.user.id, status: 'pending' }
  if (Number.isInteger(month) && Number.isInteger(year)) {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 1)
    where.date = { gte: start, lt: end }
  }

  const candidates = await prisma.emailTransactionCandidate.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(candidates)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = session.user.id

  const body = await req.json()
  const { id, action, amount, type, description, categoryId } = body as {
    id: string
    action: 'confirm' | 'dismiss'
    amount?: number
    type?: string
    description?: string
    categoryId?: string
  }

  const candidate = await prisma.emailTransactionCandidate.findFirst({ where: { id, userId } })
  if (!candidate || candidate.status !== 'pending') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (action === 'dismiss') {
    await prisma.emailTransactionCandidate.update({ where: { id }, data: { status: 'dismissed' } })
    return NextResponse.json({ ok: true })
  }

  if (action === 'confirm') {
    const finalType = type || candidate.type
    let finalCategoryId = categoryId || candidate.matchedCategoryId

    if (!finalCategoryId) {
      const cats = await prisma.category.findMany({
        where: { type: finalType, OR: [{ userId }, { userId: null, isDefault: true }] },
      })
      const matched = matchCategory(candidate.categoryName, cats) || cats.find(c => c.name === 'อื่นๆ') || cats[0]
      finalCategoryId = matched?.id
    }
    if (!finalCategoryId) return NextResponse.json({ error: 'ไม่พบหมวดหมู่' }, { status: 400 })

    const tx = await prisma.transaction.create({
      data: {
        userId,
        amount: amount ?? candidate.amount,
        type: finalType,
        description: description ?? candidate.description,
        categoryId: finalCategoryId,
        date: candidate.date ?? undefined,
        aiGenerated: true,
        rawInput: candidate.rawSnippet,
      },
      include: { category: true },
    })
    await prisma.emailTransactionCandidate.update({
      where: { id },
      data: { status: 'confirmed', transactionId: tx.id },
    })
    return NextResponse.json({ ok: true, transaction: tx })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
