import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const locales = ['th', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'th'

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale
  }
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
