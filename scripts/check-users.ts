import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
})

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, role: true, password: true, createdAt: true },
  })
  console.log(`Found ${users.length} users:`)
  for (const u of users) {
    console.log(`- ${u.email} (${u.role}) | password: ${u.password ? `SET (${u.password.length} chars, starts ${u.password.slice(0, 4)})` : 'NULL'} | id: ${u.id}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
