import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { analyzeTransaction, analyzeTransactionImage } from '@/lib/ai/analyze'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { text, imageBase64, mimeType } = body

    if (!text?.trim() && !imageBase64) {
      return NextResponse.json({ error: 'No input provided' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    const apiKey = user?.aiApiKey || undefined
    const aiModel = user?.aiModel || undefined
    const language = (user?.language || 'th') as 'th' | 'en'

    const result = imageBase64
      ? await analyzeTransactionImage(imageBase64, mimeType || 'image/png', text || '', 'openrouter', apiKey, language)
      : await analyzeTransaction(text, 'openrouter', apiKey, language, aiModel)

    const categories = await prisma.category.findMany({
      where: { OR: [{ userId: session.user.id }, { isDefault: true }] },
    })

    const matchedCategory = categories.find(c =>
      c.name.toLowerCase().includes(result.categoryName.toLowerCase()) ||
      (c.nameEn && c.nameEn.toLowerCase().includes(result.categoryName.toLowerCase()))
    ) || categories.find(c => c.name === 'อื่นๆ' || c.nameEn === 'Others')

    return NextResponse.json({ ...result, categoryId: matchedCategory?.id, category: matchedCategory })
  } catch (err) {
    console.error('AI analyze error:', err)
    return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 })
  }
}
