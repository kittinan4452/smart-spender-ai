import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildConsentUrl, RETURN_TO_COOKIE, sanitizeReturnTo } from '@/lib/gmail/oauth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.redirect(new URL('/th/login', req.url))

  const redirectUri = new URL('/api/gmail/callback', req.url).toString()
  const consentUrl = buildConsentUrl(redirectUri, session.user.id)
  const res = NextResponse.redirect(consentUrl)

  // Remember where the user started (e.g. the reconnect popup on /th/transactions) so the
  // callback can send them straight back there instead of to settings.
  const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get('returnTo'))
  if (returnTo) {
    res.cookies.set(RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.nextUrl.protocol === 'https:',
      path: '/api/gmail',
      maxAge: 10 * 60,
    })
  }
  return res
}
