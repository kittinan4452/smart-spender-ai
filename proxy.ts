import createMiddleware from 'next-intl/middleware'
import { auth } from '@/lib/auth'
import { locales, defaultLocale } from '@/lib/i18n'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
})

const publicRoutes = ['/login', '/register']

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  const isPublicRoute = locales.some(locale =>
    publicRoutes.some(route => pathname === `/${locale}${route}`)
  )

  if (!isPublicRoute && !pathname.startsWith('/api/auth') && !pathname.startsWith('/_next')) {
    const session = await auth()
    if (!session && !pathname.match(/^\/(th|en)\/(login|register)/)) {
      const locale = locales.find(l => pathname.startsWith(`/${l}`)) || defaultLocale
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url))
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
}
