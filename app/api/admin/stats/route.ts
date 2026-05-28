import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [totalUsers, newThisMonth, users, totalTransactions, transactionsThisMonth] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: { select: { transactions: true } },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
    prisma.transaction.count(),
    prisma.transaction.count({ where: { createdAt: { gte: startOfMonth } } }),
  ])

  const activeToday = users.filter(u =>
    u.transactions[0] && new Date(u.transactions[0].createdAt) >= startOfDay
  ).length

  const activeLast30 = users.filter(u =>
    u.transactions[0] && new Date(u.transactions[0].createdAt) >= last30Days
  ).length

  return NextResponse.json({
    totalUsers,
    newThisMonth,
    activeToday,
    activeLast30,
    totalTransactions,
    transactionsThisMonth,
    users: users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      transactionCount: u._count.transactions,
      lastActive: u.transactions[0]?.createdAt || null,
    })),
  })
}
