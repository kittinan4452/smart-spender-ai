import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { buildConsentUrl } from '@/lib/gmail/oauth'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.redirect(new URL('/th/login', req.url))

  const redirectUri = new URL('/api/gmail/callback', req.url).toString()
  const consentUrl = buildConsentUrl(redirectUri, session.user.id)
  return NextResponse.redirect(consentUrl)
}
