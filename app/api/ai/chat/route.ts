import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { generateText, stepCountIs } from 'ai'
import { runWithOpenRouterFallback, OPENROUTER_DEFAULT_TEXT_MODEL } from '@/lib/ai/providers'
import { createChatTools } from '@/lib/ai/chat-tools'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    type HistoryMsg = { role: 'user' | 'assistant'; content: string }
    const body = (await req.json()) as { message?: string; history?: HistoryMsg[] }
    const message = body.message || ''
    const history: HistoryMsg[] = Array.isArray(body.history)
      ? body.history
          .slice(-10)
          .filter((m): m is HistoryMsg =>
            !!m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')
          )
      : []
    const userId = session.user.id

    const user = await prisma.user.findUnique({ where: { id: userId } })

    const now = new Date()
    const txCountThisMonth = await prisma.transaction.count({
      where: {
        userId,
        date: { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: now },
      },
    })

    const systemPrompt = [
      'คุณเป็นผู้ช่วยการเงินส่วนตัวที่ช่วยจัดการรายรับรายจ่ายของผู้ใช้',
      'คุณมี tools สำหรับเพิ่ม/ลบ transaction, ตั้ง budget, และดูสรุปได้',
      'เมื่อ user สั่งให้ทำอะไร (เช่น "เพิ่มรายจ่าย 100 ค่ากาแฟ", "ลบรายการล่าสุด", "ตั้งงบอาหาร 5000") ให้เรียก tool ที่เหมาะสมทันที',
      'เมื่อ user ถามข้อมูล ใช้ getSummary หรือ listRecentTransactions เพื่อดึงข้อมูลก่อนตอบ',
      'หลังเรียก tool เสร็จ ให้สรุปผลให้ user สั้นๆ ภาษาไทย (เช่น "บันทึกค่ากาแฟ 80 บาท ในหมวดอาหารแล้ว ✓")',
      `วันนี้: ${now.toISOString().slice(0, 10)} | เดือนนี้มี ${txCountThisMonth} รายการ`,
      'ตอบสั้น กระชับ ภาษาไทย',
    ].join('\n')

    const { tools, mutated } = createChatTools(userId)

    const messages = [
      ...history,
      { role: 'user' as const, content: message },
    ]

    const result = await runWithOpenRouterFallback(user?.aiApiKey, OPENROUTER_DEFAULT_TEXT_MODEL, (_, model) =>
      generateText({
        model,
        system: systemPrompt,
        messages,
        tools,
        stopWhen: stepCountIs(5),
      })
    )
    let replyText = result.text || (mutated.changed ? 'เรียบร้อย ✓' : '')
    if (!replyText) replyText = 'ขออภัย ตอบไม่ได้'

    return NextResponse.json({ reply: replyText, dbChanged: mutated.changed })
  } catch (err) {
    console.error('AI chat error:', err)
    const msg = err instanceof Error ? err.message : 'AI chat failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
