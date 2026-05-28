import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db/prisma'
import { generateObject } from 'ai'
import { z } from 'zod'
import { runWithOpenRouterFallback, OPENROUTER_DEFAULT_TEXT_MODEL } from '@/lib/ai/providers'

const resultSchema = z.object({
  summary: z.string().describe('สรุปภาษาไทยสั้นๆ เหตุผลที่แนะนำแบบนี้'),
  savingsAmount: z.number().describe('จำนวนเงินที่แนะนำให้เก็บ'),
  allocations: z.array(z.object({
    categoryId: z.string(),
    categoryName: z.string(),
    amount: z.number(),
    reason: z.string().describe('เหตุผลสั้นๆ ภาษาไทย'),
  })),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const { income, savingsGoalPct, month, year, categoryIds } = await req.json()
  if (!income || income <= 0) return NextResponse.json({ error: 'กรุณาระบุรายได้' }, { status: 400 })
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    return NextResponse.json({ error: 'กรุณาเลือกหมวดที่ต้องการตั้งงบ' }, { status: 400 })
  }

  const now = new Date()
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)

  let categories, recentTx, user
  try {
    ;[categories, recentTx, user] = await Promise.all([
      prisma.category.findMany({
        where: {
          id: { in: categoryIds },
          type: 'expense',
          OR: [{ isDefault: true, userId: null }, { userId }],
        },
        orderBy: { name: 'asc' },
      }),
      prisma.transaction.findMany({
        where: { userId, type: 'expense', date: { gte: threeMonthsAgo }, categoryId: { in: categoryIds } },
        include: { category: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { aiModel: true, aiApiKey: true } }),
    ])
  } catch (err) {
    const code = (err as { code?: string })?.code
    if (code === 'P1001' || code === 'P1002') {
      return NextResponse.json(
        { error: 'ฐานข้อมูลกำลัง wake up — รอ 10-20 วินาที แล้วลองใหม่' },
        { status: 503 }
      )
    }
    console.error('[budget-plan] DB error:', err)
    return NextResponse.json({ error: 'ดึงข้อมูลไม่สำเร็จ' }, { status: 500 })
  }

  // คำนวณค่าเฉลี่ยรายจ่ายต่อเดือน 3 เดือนที่ผ่านมา
  const spendMap: Record<string, { name: string; total: number }> = {}
  for (const tx of recentTx) {
    if (!spendMap[tx.categoryId]) spendMap[tx.categoryId] = { name: tx.category.name, total: 0 }
    spendMap[tx.categoryId].total += tx.amount
  }
  const avgSpend = Object.entries(spendMap).map(([id, v]) => ({
    categoryId: id,
    name: v.name,
    avgPerMonth: Math.round(v.total / 3),
  }))

  const savingsBaht = Math.round(income * ((savingsGoalPct ?? 20) / 100))
  const spendable = income - savingsBaht

  const catList = categories.map(c => `- ${c.id} | ${c.name}`).join('\n')
  const historyList = avgSpend.length > 0
    ? avgSpend.map(a => `- ${a.name}: เฉลี่ย ฿${a.avgPerMonth.toLocaleString()}/เดือน`).join('\n')
    : '(ยังไม่มีข้อมูลรายจ่าย)'

  const prompt = `คุณเป็นที่ปรึกษาการเงินส่วนตัว ช่วยวางแผนงบประมาณรายเดือนให้ผู้ใช้

รายได้เดือนนี้: ฿${income.toLocaleString()}
เป้าหมายเงินเก็บ: ${savingsGoalPct ?? 20}% = ฿${savingsBaht.toLocaleString()}
เงินที่ใช้ได้: ฿${spendable.toLocaleString()}
เดือน/ปี: ${month}/${year}

ประวัติการใช้จ่าย 3 เดือนที่ผ่านมา (เฉลี่ย/เดือน) เฉพาะหมวดที่ผู้ใช้เลือก:
${historyList}

หมวดหมู่ที่ผู้ใช้เลือกให้ตั้งงบ (ต้องใส่ครบทุกหมวด):
${catList}

กรุณาแนะนำจำนวนเงินงบของแต่ละหมวดที่ผู้ใช้เลือก รวมกันต้องไม่เกิน ฿${spendable.toLocaleString()}
- ต้องใส่ผลลัพธ์ครบทุกหมวดที่ผู้ใช้เลือก (ห้ามตัดทิ้ง)
- หมวดที่มีประวัติใช้จ่าย ให้อิงจากค่าเฉลี่ยจริงของผู้ใช้ ปรับเพิ่ม/ลดตามความเหมาะสม
- หมวดที่ยังไม่มีประวัติ ให้ประมาณการตามค่ามาตรฐานทั่วไป พร้อมเหตุผลสั้นๆ`

  try {
    const preferred = user?.aiModel || OPENROUTER_DEFAULT_TEXT_MODEL
    const result = await runWithOpenRouterFallback(user?.aiApiKey, preferred, (_, model) =>
      generateObject({
        model,
        prompt,
        schema: resultSchema,
      })
    )

    return NextResponse.json(result.object)
  } catch (err) {
    console.error('[budget-plan] AI error:', err)
    return NextResponse.json({ error: 'AI วิเคราะห์ไม่สำเร็จ' }, { status: 500 })
  }
}
