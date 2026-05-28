import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
})

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  const name = process.env.ADMIN_NAME || 'Admin'

  if (!email || !password) {
    console.error('❌ ต้องตั้งค่า ADMIN_EMAIL และ ADMIN_PASSWORD ใน .env.local ก่อน')
    process.exit(1)
  }

  if (password.length < 8) {
    console.error('❌ ADMIN_PASSWORD ต้องมีอย่างน้อย 8 ตัวอักษร')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role !== 'admin') {
      await prisma.user.update({ where: { email }, data: { role: 'admin' } })
      console.log(`✓ อัปเดต ${email} เป็น admin แล้ว`)
    } else {
      console.log(`✓ ${email} เป็น admin อยู่แล้ว`)
    }
    return
  }

  const hashed = await bcrypt.hash(password, 10)
  await prisma.user.create({
    data: { name, email, password: hashed, role: 'admin' },
  })

  console.log('✓ สร้าง admin สำเร็จ')
  console.log(`  Email   : ${email}`)
  console.log(`  Password: ${password}`)
  console.log(`  Name    : ${name}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
