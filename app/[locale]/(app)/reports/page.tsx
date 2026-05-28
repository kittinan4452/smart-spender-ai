'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useDataRefresh } from '@/lib/hooks/useDataRefresh'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'

interface Summary {
  income: number
  expense: number
  balance: number
  byCategory: { name: string; nameEn: string | null; icon: string; color: string; amount: number; type: string }[]
}

export default function ReportsPage() {
  const t = useTranslations()
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [summary, setSummary] = useState<Summary | null>(null)

  const load = useCallback((signal?: AbortSignal) => {
    fetch(`/api/transactions/summary?month=${month}&year=${year}`, { signal })
      .then(r => r.ok ? r.json() : null).then(d => d && setSummary(d))
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
  }, [month, year])

  useEffect(() => {
    const ac = new AbortController()
    load(ac.signal)
    return () => ac.abort()
  }, [load])

  useDataRefresh(load)

  const expenseData = summary?.byCategory.filter(c => c.type === 'expense').sort((a, b) => b.amount - a.amount) || []
  const barData = [
    { name: t('dashboard.income'), amount: summary?.income || 0, fill: '#10b981' },
    { name: t('dashboard.expense'), amount: summary?.expense || 0, fill: '#ef4444' },
  ]

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2024, i, 1).toLocaleString('th-TH', { month: 'long' }),
  }))

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('reports.title')}</h1>
        <div className="flex gap-3">
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100"
          >
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 dark:text-gray-100"
          >
            {[2024, 2025, 2026].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.income')}</p>
          <p className="text-2xl font-bold text-green-600 mt-1">฿{(summary?.income || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.expense')}</p>
          <p className="text-2xl font-bold text-red-500 mt-1">฿{(summary?.expense || 0).toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('dashboard.totalBalance')}</p>
          <p className={`text-2xl font-bold mt-1 ${(summary?.balance || 0) >= 0 ? 'text-indigo-600' : 'text-red-500'}`}>
            ฿{(summary?.balance || 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bar Chart */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('reports.monthly')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => `฿${Number(v).toLocaleString()}`} />
              <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('reports.byCategory')}</h3>
          {expenseData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={expenseData} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={70}>
                  {expenseData.map((cat, i) => <Cell key={i} fill={cat.color} />)}
                </Pie>
                <Tooltip formatter={(v) => `฿${Number(v).toLocaleString()}`} />
                <Legend formatter={(name) => <span className="text-xs">{name}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">ไม่มีข้อมูล</div>
          )}
        </div>

        {/* Category Breakdown */}
        <div className="col-span-1 md:col-span-2 bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">{t('reports.byCategory')} (รายจ่าย)</h3>
          {expenseData.length > 0 ? (
            <div className="space-y-3">
              {expenseData.map((cat, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-xl w-8">{cat.icon}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300 font-medium">{cat.name}</span>
                      <span className="text-gray-900 dark:text-gray-100 font-semibold">฿{cat.amount.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (cat.amount / (summary?.expense || 1)) * 100)}%`,
                          backgroundColor: cat.color,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 w-12 text-right">
                    {Math.round((cat.amount / (summary?.expense || 1)) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">ไม่มีรายจ่ายในเดือนนี้</div>
          )}
        </div>
      </div>
    </div>
  )
}
