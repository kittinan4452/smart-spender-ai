'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import ThemeToggle from './ThemeToggle'

const navItems = [
  { key: 'dashboard', href: '/dashboard', icon: '📊' },
  { key: 'transactions', href: '/transactions', icon: '💳' },
  { key: 'budget', href: '/budget', icon: '🎯' },
  { key: 'reports', href: '/reports', icon: '📈' },
  { key: 'settings', href: '/settings', icon: '⚙️' },
]

export default function Sidebar() {
  const t = useTranslations('nav')
  const params = useParams()
  const pathname = usePathname()
  const locale = params.locale as string
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  return (
    <aside className="w-64 bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800 flex flex-col min-h-screen shadow-sm">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <span className="font-bold text-indigo-700 dark:text-indigo-400 text-lg">Smart Spender</span>
        </div>
        <div className="text-xs text-gray-400 mt-1 ml-9">AI</div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => {
          const href = `/${locale}${item.href}`
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={item.key}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <span className="text-xl">{item.icon}</span>
              {t(item.key as 'dashboard' | 'transactions' | 'budget' | 'reports' | 'settings')}
            </Link>
          )
        })}

        {isAdmin && (
          <>
            <div className="pt-3 pb-1 px-4">
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wider">Admin</p>
            </div>
            <Link
              href={`/${locale}/admin`}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                pathname === `/${locale}/admin`
                  ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <span className="text-xl">🛡️</span>
              จัดการระบบ
            </Link>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-2">
        <div className="flex items-center justify-between px-2">
          <div className="flex gap-2">
            <Link href="/th/dashboard" className={`text-xs px-2 py-1 rounded ${locale === 'th' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-gray-400 hover:text-gray-600'}`}>ไทย</Link>
            <Link href="/en/dashboard" className={`text-xs px-2 py-1 rounded ${locale === 'en' ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' : 'text-gray-400 hover:text-gray-600'}`}>EN</Link>
          </div>
          <ThemeToggle />
        </div>
        <button
          onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          <span>🚪</span>
          {t('logout')}
        </button>
      </div>
    </aside>
  )
}
