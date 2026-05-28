import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
})

async function main() {
  const email = 'superadmin@gmail.com'
  const password = 'superadmin2544'
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return console.log('❌ user not found')
  if (!user.password) return console.log('❌ no password set')
  const valid = await bcrypt.compare(password, user.password)
  console.log(valid ? '✅ password matches' : '❌ password does NOT match')
}

main().catch(console.error).finally(() => prisma.$disconnect())
