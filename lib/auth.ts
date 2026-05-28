import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/th/login',
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) {
          console.warn('[auth] schema invalid:', parsed.error.issues)
          return null
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
          })
          if (!user) {
            console.warn('[auth] user not found:', parsed.data.email)
            return null
          }
          if (!user.password) {
            console.warn('[auth] user has no password:', parsed.data.email)
            return null
          }

          const valid = await bcrypt.compare(parsed.data.password, user.password)
          if (!valid) {
            console.warn('[auth] password mismatch for:', parsed.data.email)
            return null
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
          }
        } catch (err) {
          console.error('[auth] authorize error:', err)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role
      }
      // Google OAuth ไม่ส่ง role มาด้วย ดึงจาก DB แทน
      if (token.id && !token.role) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true },
        })
        token.role = dbUser?.role
      }
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      if (token.role) session.user.role = token.role as string
      return session
    },
  },
})
