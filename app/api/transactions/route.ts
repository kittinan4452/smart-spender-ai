import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { z } from 'zod'

const createSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(['income', 'expense']),
  description: z.string().optional(),
  categoryId: z.string(),
  date: z.string(),
  note: z.string().optional(),
  aiGenerated: z.boolean().optional(),
  rawInput: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')
  const type = searchParams.get('type')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
  const skip = Math.max(parseInt(searchParams.get('skip') || '0'), 0)

  const where: Record<string, unknown> = { userId: session.user.id }

  if (month && year) {
    const startDate = new Date(parseInt(year), parseInt(month) - 1, 1)
    const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59)
    where.date = { gte: startDate, lte: endDate }
  }
  if (type) where.type = type

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true },
    orderBy: { date: 'desc' },
    skip,
    take: limit,
  })

  return NextResponse.json(transactions)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const transaction = await prisma.transaction.create({
      data: {
        ...data,
        description: data.description ?? '',
        date: new Date(data.date),
        userId: session.user.id,
      },
      include: { category: true },
    })

    return NextResponse.json(transaction, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
