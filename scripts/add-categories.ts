import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const newCategories = [
  { name: 'ค่าห้อง / ค่าเช่า', nameEn: 'Rent', icon: '🏠', color: '#7c3aed', type: 'expense' },
  { name: 'ค่าไฟ / ค่าน้ำ', nameEn: 'Electricity & Water', icon: '⚡', color: '#d97706', type: 'expense' },
  { name: 'ค่าโทรศัพท์ / อินเทอร์เน็ต', nameEn: 'Phone & Internet', icon: '📱', color: '#0891b2', type: 'expense' },
  { name: 'ประกัน', nameEn: 'Insurance', icon: '🛡️', color: '#be185d', type: 'expense' },
  { name: 'เงินเก็บ / ออมทรัพย์', nameEn: 'Savings', icon: '🏦', color: '#059669', type: 'expense' },
]

async function main() {
  let added = 0
  let skipped = 0

  for (const cat of newCategories) {
    const existing = await prisma.category.findFirst({
      where: { name: cat.name, isDefault: true, userId: null },
    })
    if (existing) {
      console.log(`⏭  ข้ามแล้ว (มีอยู่แล้ว): ${cat.name}`)
      skipped++
    } else {
      await prisma.category.create({ data: { ...cat, isDefault: true } })
      console.log(`✓  เพิ่มแล้ว: ${cat.name}`)
      added++
    }
  }

  console.log(`\nสรุป: เพิ่ม ${added} | ข้าม ${skipped}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
