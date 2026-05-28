import { tool } from 'ai'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'

function matchCategory(name: string, cats: { id: string; name: string; nameEn: string | null }[]) {
  const n = name.toLowerCase().trim()
  return (
    cats.find(c => c.name.toLowerCase() === n || c.nameEn?.toLowerCase() === n) ||
    cats.find(c => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())) ||
    cats.find(c => c.nameEn && (c.nameEn.toLowerCase().includes(n) || n.includes(c.nameEn.toLowerCase())))
  )
}

export function createChatTools(userId: string) {
  const mutated = { changed: false }

  const tools = {
    addTransaction: tool({
      description:
        'เพิ่ม transaction (รายรับ/รายจ่าย) ของผู้ใช้ ใช้เมื่อ user สั่งให้บันทึก/เพิ่ม/จด/ลง รายการเงิน',
      inputSchema: z.object({
        amount: z.number().positive().describe('จำนวนเงิน (บาท)'),
        type: z.enum(['income', 'expense']).describe('income = รายรับ, expense = รายจ่าย'),
        categoryName: z
          .string()
          .describe(
            'ชื่อหมวดหมู่ภาษาไทย เช่น "อาหาร & เครื่องดื่ม", "เดินทาง", "เงินเดือน", "รายได้พิเศษ"'
          ),
        description: z.string().describe('คำอธิบายสั้นๆ เช่น "ค่ากาแฟ Starbucks"'),
      }),
      execute: async ({ amount, type, categoryName, description }) => {
        const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
        if (!userExists) {
          return { ok: false, error: 'session หมดอายุ กรุณา logout แล้ว login ใหม่' }
        }
        const cats = await prisma.category.findMany({
          where: { type, OR: [{ userId }, { userId: null, isDefault: true }] },
        })
        if (cats.length === 0) return { ok: false, error: 'ไม่พบหมวดหมู่ในระบบ' }
        const cat = matchCategory(categoryName, cats) || cats.find(c => c.name === 'อื่นๆ') || cats[0]
        try {
          const tx = await prisma.transaction.create({
            data: { userId, amount, type, description, categoryId: cat.id, aiGenerated: true },
            include: { category: true },
          })
          mutated.changed = true
          return {
            ok: true,
            id: tx.id,
            amount: tx.amount,
            type: tx.type,
            category: tx.category.name,
            description: tx.description,
          }
        } catch (err) {
          console.error('[addTransaction] failed:', { userId, categoryId: cat.id, err })
          return { ok: false, error: 'บันทึกไม่สำเร็จ (DB error)' }
        }
      },
    }),

    deleteRecentTransaction: tool({
      description:
        'ลบ transaction ล่าสุดของผู้ใช้ (หรือลบโดยระบุคำค้น). ใช้เมื่อ user สั่งให้ลบ/ยกเลิก/เอาออก รายการล่าสุด',
      inputSchema: z.object({
        keyword: z
          .string()
          .optional()
          .describe('คำค้นใน description (เช่น "กาแฟ") — ถ้าไม่ระบุจะลบรายการล่าสุด'),
      }),
      execute: async ({ keyword }) => {
        const tx = await prisma.transaction.findFirst({
          where: {
            userId,
            ...(keyword ? { description: { contains: keyword, mode: 'insensitive' as const } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          include: { category: true },
        })
        if (!tx) return { ok: false, error: 'ไม่พบรายการ' }
        await prisma.transaction.delete({ where: { id: tx.id } })
        mutated.changed = true
        return {
          ok: true,
          deleted: { description: tx.description, amount: tx.amount, category: tx.category.name },
        }
      },
    }),

    setBudget: tool({
      description: 'ตั้งงบประมาณ (budget) ของหมวดหมู่สำหรับเดือนปัจจุบัน',
      inputSchema: z.object({
        categoryName: z.string().describe('ชื่อหมวดหมู่ภาษาไทย'),
        amount: z.number().min(0).describe('จำนวนเงินงบประมาณ (บาท)'),
      }),
      execute: async ({ categoryName, amount }) => {
        const cats = await prisma.category.findMany({
          where: { type: 'expense', OR: [{ userId }, { userId: null, isDefault: true }] },
        })
        const cat = matchCategory(categoryName, cats)
        if (!cat) return { ok: false, error: `ไม่พบหมวดหมู่: ${categoryName}` }
        const now = new Date()
        const month = now.getMonth() + 1
        const year = now.getFullYear()
        await prisma.budget.upsert({
          where: { userId_categoryId_month_year: { userId, categoryId: cat.id, month, year } },
          update: { amount },
          create: { userId, categoryId: cat.id, amount, month, year, spent: 0 },
        })
        mutated.changed = true
        return { ok: true, category: cat.name, amount, month, year }
      },
    }),

    getSummary: tool({
      description: 'ดูสรุปรายรับ/รายจ่ายของผู้ใช้สำหรับช่วงเวลาที่ระบุ',
      inputSchema: z.object({
        period: z
          .enum(['this_month', 'last_month', 'this_year'])
          .default('this_month')
          .describe('ช่วงเวลา'),
      }),
      execute: async ({ period }) => {
        const now = new Date()
        let start: Date, end: Date
        if (period === 'last_month') {
          start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
        } else if (period === 'this_year') {
          start = new Date(now.getFullYear(), 0, 1)
          end = now
        } else {
          start = new Date(now.getFullYear(), now.getMonth(), 1)
          end = now
        }
        const txs = await prisma.transaction.findMany({
          where: { userId, date: { gte: start, lte: end } },
          include: { category: true },
        })
        const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
        const byCategory: Record<string, number> = {}
        for (const t of txs.filter(t => t.type === 'expense')) {
          byCategory[t.category.name] = (byCategory[t.category.name] || 0) + t.amount
        }
        return {
          period,
          income,
          expense,
          balance: income - expense,
          count: txs.length,
          topCategories: Object.entries(byCategory)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, amount]) => ({ name, amount })),
        }
      },
    }),

    listRecentTransactions: tool({
      description: 'ดูรายการ transactions ล่าสุดของผู้ใช้',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).default(5),
      }),
      execute: async ({ limit }) => {
        const txs = await prisma.transaction.findMany({
          where: { userId },
          orderBy: { date: 'desc' },
          take: limit,
          include: { category: true },
        })
        return {
          transactions: txs.map(t => ({
            id: t.id,
            date: t.date.toISOString().slice(0, 10),
            type: t.type,
            amount: t.amount,
            description: t.description,
            category: t.category.name,
          })),
        }
      },
    }),
  }

  return { tools, mutated }
}
