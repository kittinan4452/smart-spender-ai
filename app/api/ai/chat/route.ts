import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { generateText } from 'ai'
import { runWithOpenRouterFallback, OPENROUTER_DEFAULT_TEXT_MODEL } from '@/lib/ai/providers'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { message } = await req.json()

  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  const aiModel = user?.aiModel || undefined

  const now = new Date()
  const transactions = await prisma.transaction.findMany({
    where: {
      userId: session.user.id,
      date: {
        gte: new Date(now.getFullYear(), now.getMonth(), 1),
        lte: now,
      },
    },
    include: { category: true },
    take: 100,
  })

  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const balance = income - expense
  const recent = transactions.slice(0, 10).map(t => t.description + ' ' + t.amount + ' (' + t.category.name + ')').join(', ')
  const systemPrompt = [
    'You are a personal finance assistant. Help analyze the user income and expenses.',
    'This month: income ' + income.toLocaleString() + ', expense ' + expense.toLocaleString() + ', balance ' + balance.toLocaleString(),
    'Recent transactions: ' + recent,
    'Reply primarily in Thai, concise and to the point.',
  ].join('\n')

  const preferred = aiModel || OPENROUTER_DEFAULT_TEXT_MODEL
  const text = (await runWithOpenRouterFallback(user?.aiApiKey, preferred, (_, model) =>
    generateText({ model, system: systemPrompt, prompt: message })
  )).text

    return NextResponse.json({ reply: text })
  } catch (err) {
    console.error('AI chat error:', err)
    const msg = err instanceof Error ? err.message : 'AI chat failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
