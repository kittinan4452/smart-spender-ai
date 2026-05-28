import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  const [categories, budgets, transactions] = await Promise.all([
    prisma.category.findMany({
      where: {
        type: 'expense',
        OR: [{ isDefault: true, userId: null }, { userId: session.user.id }],
      },
      orderBy: { name: 'asc' },
    }),
    prisma.budget.findMany({
      where: { userId: session.user.id, month, year },
    }),
    prisma.transaction.findMany({
      where: {
        userId: session.user.id,
        type: 'expense',
        date: { gte: startDate, lte: endDate },
      },
      select: { categoryId: true, amount: true },
    }),
  ])

  const spentMap = transactions.reduce<Record<string, number>>((acc, t) => {
    acc[t.categoryId] = (acc[t.categoryId] ?? 0) + t.amount
    return acc
  }, {})

  const budgetMap = budgets.reduce<Record<string, number>>((acc, b) => {
    acc[b.categoryId] = b.amount
    return acc
  }, {})

  const rows = categories.map(cat => ({
    categoryId: cat.id,
    name: cat.name,
    nameEn: cat.nameEn,
    icon: cat.icon,
    color: cat.color,
    budget: budgetMap[cat.id] ?? null,
    spent: spentMap[cat.id] ?? 0,
  }))

  const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0)
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0)

  return NextResponse.json({ rows, totalBudget, totalSpent, month, year })
}

const upsertSchema = z.object({
  categoryId: z.string(),
  amount: z.number().min(0),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { categoryId, amount, month, year } = upsertSchema.parse(body)

    const budget = await prisma.budget.upsert({
      where: { userId_categoryId_month_year: { userId: session.user.id, categoryId, month, year } },
      update: { amount },
      create: { userId: session.user.id, categoryId, amount, month, year, spent: 0 },
    })

    return NextResponse.json(budget)
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
