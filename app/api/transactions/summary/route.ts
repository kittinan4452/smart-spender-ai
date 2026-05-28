import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  const transactions = await prisma.transaction.findMany({
    where: { userId: session.user.id, date: { gte: startDate, lte: endDate } },
    include: { category: true },
  })

  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const byCategory = transactions.reduce((acc: Record<string, { name: string; nameEn: string | null; icon: string; color: string; amount: number; type: string }>, t) => {
    const key = t.categoryId
    if (!acc[key]) {
      acc[key] = { name: t.category.name, nameEn: t.category.nameEn, icon: t.category.icon, color: t.category.color, amount: 0, type: t.type }
    }
    acc[key].amount += t.amount
    return acc
  }, {})

  return NextResponse.json({ income, expense, balance: income - expense, byCategory: Object.values(byCategory) })
}
