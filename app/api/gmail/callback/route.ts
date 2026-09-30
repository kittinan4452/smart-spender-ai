import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyState, exchangeCodeForTokens } from '@/lib/gmail/oauth'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const userId = state ? verifyState(state) : null
  if (error || !code || !userId) {
    return NextResponse.redirect(`${origin}/th/settings?gmail=error`)
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true } })
  const locale = user?.language === 'en' ? 'en' : 'th'

  try {
    const redirectUri = `${origin}/api/gmail/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    if (!tokens.refresh_token) {
      console.error('[gmail-callback] no refresh_token returned for user', userId)
      return NextResponse.redirect(`${origin}/${locale}/settings?gmail=error`)
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
    await prisma.gmailAccount.upsert({
      where: { userId },
      create: {
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scope: tokens.scope,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scope: tokens.scope,
        lastError: null,
      },
    })

    return NextResponse.redirect(`${origin}/${locale}/settings?gmail=connected`)
  } catch (err) {
    console.error('[gmail-callback] failed:', err)
    return NextResponse.redirect(`${origin}/${locale}/settings?gmail=error`)
  }
}
