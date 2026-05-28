'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'

export default function MobileHeader() {
  const t = useTranslations('nav')
  const params = useParams()
  const locale = params.locale as string
  const { data: session } = useSession()
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = (session?.user?.name || session?.user?.email || '?').charAt(0).toUpperCase()
  const otherLocale = locale === 'th' ? 'en' : 'th'

  return (
    <header className="md:hidden sticky top-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between px-4 h-12">
        <Link href={`/${locale}/dashboard`} className="flex items-center gap-2">
          <span className="text-xl">💰</span>
          <span className="font-bold text-indigo-700 dark:text-indigo-400 text-sm">Smart Spender</span>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen(o => !o)}
            aria-label="User menu"
            className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold text-sm flex items-center justify-center hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-700 transition"
          >
            {initial}
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-lg overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {session?.user?.name || 'ผู้ใช้'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{session?.user?.email}</p>
              </div>

              {/* Theme + Language row */}
              <div className="px-2 py-2 border-b border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-1">
                <button
                  onClick={() => mounted && setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <span>{mounted ? (theme === 'dark' ? '☀️' : '🌙') : '🌙'}</span>
                  <span className="text-xs">{mounted ? (theme === 'dark' ? 'Light' : 'Dark') : 'Theme'}</span>
                </button>
                <Link
                  href={`/${otherLocale}/dashboard`}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <span>🌐</span>
                  <span className="text-xs">{otherLocale === 'th' ? 'ไทย' : 'EN'}</span>
                </Link>
              </div>

              {/* Settings link */}
              <Link
                href={`/${locale}/settings`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <span>⚙️</span>
                <span>{t('settings')}</span>
              </Link>

              {/* Logout */}
              <button
                onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 transition border-t border-gray-100 dark:border-gray-800"
              >
                <span>🚪</span>
                <span>{t('logout')}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
