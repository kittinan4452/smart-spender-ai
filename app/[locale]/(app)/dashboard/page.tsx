'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useDataRefresh } from '@/lib/hooks/useDataRefresh'

interface Summary {
  income: number
  expense: number
  balance: number
  byCategory: { name: string; nameEn: string | null; icon: string; color: string; amount: number; type: string }[]
}

interface Transaction {
  id: string
  amount: number
  type: string
  description: string
  date: string
  category: { name: string; icon: string }
}

export default function DashboardPage() {
  const t = useTranslations()
  const params = useParams()
  const locale = params.locale as string
  const [summary, setSummary] = useState<Summary | null>(null)
  const [recent, setRecent] = useState<Transaction[]>([])

  const now = new Date()

  const load = useCallback((signal?: AbortSignal) => {
    fetch(`/api/transactions/summary?month=${now.getMonth() + 1}&year=${now.getFullYear()}`, { signal })
      .then(r => r.ok ? r.json() : null).then(d => d && setSummary(d))
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
    fetch(`/api/transactions?limit=5`, { signal })
      .then(r => r.ok ? r.json() : null).then(d => d && setRecent(d))
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    return () => ac.abort()
  }, [load])

  useDataRefresh(load)

  const expenseCategories = summary?.byCategory.filter(c => c.type === 'expense') || []
  const monthLabel = locale === 'th'
    ? format(now, 'MMMM yyyy', { locale: th })
    : format(now, 'MMMM yyyy')

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('dashboard.thisMonth')}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{monthLabel}</p>
        </div>
        <Link
          href={`/${locale}/transactions`}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + {t('transaction.add')}
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('dashboard.income')}</p>
          <p className="text-2xl font-bold text-green-600">
            ฿{(summary?.income || 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('dashboard.expense')}</p>
          <p className="text-2xl font-bold text-red-500">
            ฿{(summary?.expense || 0).toLocaleString()}
          </p>
        </div>
        <div className={`rounded-2xl p-5 shadow-sm border ${(summary?.balance || 0) >= 0 ? 'bg-indigo-600 border-indigo-600' : 'bg-red-500 border-red-500'}`}>
          <p className="text-sm text-indigo-100 mb-1">{t('dashboard.totalBalance')}</p>
          <p className="text-2xl font-bold text-white">
            ฿{(summary?.balance || 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Expense Chart */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('dashboard.topCategories')}</h3>
          {expenseCategories.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={expenseCategories} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={false}>
                  {expenseCategories.map((cat, i) => (
                    <Cell key={i} fill={cat.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => `฿${Number(v).toLocaleString()}`} />
                <Legend formatter={(name) => <span className="text-xs">{name}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              {t('transaction.noTransactions')}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('dashboard.recentTransactions')}</h3>
          {recent.length > 0 ? (
            <div className="space-y-3">
              {recent.map(tx => (
                <div key={tx.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{tx.category.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{tx.description}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{tx.category.name}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'income' ? '+' : '-'}฿{tx.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 dark:text-gray-500 text-sm">
              {t('transaction.noTransactions')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
