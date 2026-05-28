'use client'

import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useSession } from 'next-auth/react'

const navItems = [
  { key: 'dashboard', href: '/dashboard', icon: '📊' },
  { key: 'transactions', href: '/transactions', icon: '💳' },
  { key: 'budget', href: '/budget', icon: '🎯' },
  { key: 'reports', href: '/reports', icon: '📈' },
  { key: 'settings', href: '/settings', icon: '⚙️' },
]

export default function BottomNav() {
  const t = useTranslations('nav')
  const params = useParams()
  const pathname = usePathname()
  const locale = params.locale as string
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  const items = [
    ...navItems,
    ...(isAdmin ? [{ key: 'admin', href: '/admin', icon: '🛡️' }] : []),
  ]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 z-50">
      <div className="flex">
        {items.map(item => {
          const href = `/${locale}${item.href}`
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={item.key}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                active
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              <span className="text-xl leading-none">{item.icon}</span>
              <span className="text-[10px]">
                {item.key === 'admin' ? 'Admin' : t(item.key as 'dashboard' | 'transactions' | 'budget' | 'reports' | 'settings')}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
