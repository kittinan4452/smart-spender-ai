import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { verifyState, exchangeCodeForTokens, RETURN_TO_COOKIE, sanitizeReturnTo } from '@/lib/gmail/oauth'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const returnTo = sanitizeReturnTo(req.cookies.get(RETURN_TO_COOKIE)?.value)

  /** Redirect to returnTo (or settings) with ?gmail=<status>, clearing the one-shot cookie. */
  function finish(status: 'connected' | 'error', locale = 'th') {
    const target = new URL(returnTo ?? `/${locale}/settings`, origin)
    target.searchParams.set('gmail', status)
    const res = NextResponse.redirect(target)
    res.cookies.delete({ name: RETURN_TO_COOKIE, path: '/api/gmail' })
    return res
  }

  const userId = state ? verifyState(state) : null
  if (error || !code || !userId) {
    return finish('error')
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true } })
  const locale = user?.language === 'en' ? 'en' : 'th'

  try {
    const redirectUri = `${origin}/api/gmail/callback`
    const tokens = await exchangeCodeForTokens(code, redirectUri)
    if (!tokens.refresh_token) {
      console.error('[gmail-callback] no refresh_token returned for user', userId)
      return finish('error', locale)
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

    return finish('connected', locale)
  } catch (err) {
    console.error('[gmail-callback] failed:', err)
    return finish('error', locale)
  }
}
