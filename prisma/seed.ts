import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const defaultCategories = [
  // Expense — daily living
  { name: 'อาหาร & เครื่องดื่ม', nameEn: 'Food & Drinks', icon: '🍔', color: '#f97316', type: 'expense' },
  { name: 'เดินทาง', nameEn: 'Transport', icon: '🚗', color: '#3b82f6', type: 'expense' },
  { name: 'ที่พัก', nameEn: 'Housing', icon: '🏠', color: '#8b5cf6', type: 'expense' },
  { name: 'สุขภาพ', nameEn: 'Health', icon: '💊', color: '#ef4444', type: 'expense' },
  { name: 'บันเทิง', nameEn: 'Entertainment', icon: '🎬', color: '#ec4899', type: 'expense' },
  { name: 'ช้อปปิ้ง', nameEn: 'Shopping', icon: '🛍️', color: '#06b6d4', type: 'expense' },
  { name: 'การศึกษา', nameEn: 'Education', icon: '📚', color: '#84cc16', type: 'expense' },
  { name: 'ค่าสาธารณูปโภค', nameEn: 'Utilities', icon: '💡', color: '#f59e0b', type: 'expense' },
  { name: 'ค่าห้อง / ค่าเช่า', nameEn: 'Rent', icon: '🏠', color: '#7c3aed', type: 'expense' },
  { name: 'ค่าไฟ / ค่าน้ำ', nameEn: 'Electricity & Water', icon: '⚡', color: '#d97706', type: 'expense' },
  { name: 'ค่าโทรศัพท์ / อินเทอร์เน็ต', nameEn: 'Phone & Internet', icon: '📱', color: '#0891b2', type: 'expense' },
  { name: 'ประกัน', nameEn: 'Insurance', icon: '🛡️', color: '#be185d', type: 'expense' },
  { name: 'อื่นๆ', nameEn: 'Others', icon: '📦', color: '#6b7280', type: 'expense' },
  // Expense — investment (money going out)
  { name: 'ลงทุนหุ้น', nameEn: 'Stock Investment', icon: '📊', color: '#0ea5e9', type: 'expense' },
  { name: 'ลงทุนกองทุนรวม', nameEn: 'Mutual Fund', icon: '💹', color: '#6366f1', type: 'expense' },
  { name: 'ลงทุนคริปโต', nameEn: 'Crypto Investment', icon: '₿', color: '#f59e0b', type: 'expense' },
  // Expense — debt payment
  { name: 'จ่ายหนี้ กยศ', nameEn: 'Student Loan (กยศ)', icon: '🎓', color: '#10b981', type: 'expense' },
  { name: 'จ่ายหนี้บัตรเครดิต', nameEn: 'Credit Card Payment', icon: '💳', color: '#ef4444', type: 'expense' },
  { name: 'จ่ายหนี้สินเชื่อ', nameEn: 'Loan Payment', icon: '🏦', color: '#8b5cf6', type: 'expense' },
  // Income
  { name: 'เงินเดือน', nameEn: 'Salary', icon: '💼', color: '#10b981', type: 'income' },
  { name: 'รายได้พิเศษ', nameEn: 'Extra Income', icon: '💰', color: '#059669', type: 'income' },
  { name: 'ลงทุน', nameEn: 'Investment Return', icon: '📈', color: '#0ea5e9', type: 'income' },
]

async function main() {
  let created = 0
  let skipped = 0

  for (const cat of defaultCategories) {
    const existing = await prisma.category.findFirst({
      where: { name: cat.name, isDefault: true, userId: null },
    })
    if (existing) {
      skipped++
    } else {
      await prisma.category.create({ data: { ...cat, isDefault: true } })
      created++
    }
  }

  console.log(`✓ Seeded: ${created} created, ${skipped} skipped`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
