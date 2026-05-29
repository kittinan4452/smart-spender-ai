'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import Swal from 'sweetalert2'
import AddTransactionModal from '@/components/transactions/AddTransactionModal'
import { useDataRefresh } from '@/lib/hooks/useDataRefresh'

const PAGE_SIZE = 20

interface Category {
  id: string
  name: string
  nameEn: string | null
  icon: string
  color: string
  type: string
}

interface Transaction {
  id: string
  amount: number
  type: string
  description: string
  date: string
  note: string | null
  aiGenerated: boolean
  category: Category
}

export default function TransactionsPage() {
  const t = useTranslations()
  const params = useParams()
  const locale = params.locale as string

  const [items, setItems] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showModal, setShowModal] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [monthOffset, setMonthOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef(items)
  useEffect(() => { itemsRef.current = items })

  const { month, year, monthLabel } = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + monthOffset)
    return {
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      monthLabel: locale === 'th'
        ? format(d, 'MMMM yyyy', { locale: th })
        : format(d, 'MMMM yyyy'),
    }
  }, [monthOffset, locale])

  const fetchPage = useCallback(async (skip: number, signal?: AbortSignal): Promise<Transaction[]> => {
    const sp = new URLSearchParams({
      skip: String(skip),
      limit: String(PAGE_SIZE),
      month: String(month),
      year: String(year),
    })
    if (filterType) sp.set('type', filterType)
    const res = await fetch(`/api/transactions?${sp}`, { signal })
    if (!res.ok) return []
    return res.json()
  }, [month, year, filterType])

  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/categories', { signal: ac.signal })
      .then(r => r.ok ? r.json() : []).then(setCategories)
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
    return () => ac.abort()
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    fetchPage(0, ac.signal)
      .then(data => {
        setItems(data)
        setHasMore(data.length === PAGE_SIZE)
        setLoading(false)
      })
      .catch(e => {
        if (e.name !== 'AbortError') { console.error(e); setLoading(false) }
      })
    return () => ac.abort()
  }, [fetchPage])

  const refresh = useCallback(() => {
    fetchPage(0).then(data => {
      setItems(data)
      setHasMore(data.length === PAGE_SIZE)
    }).catch(() => {})
  }, [fetchPage])

  useDataRefresh(refresh)

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const data = await fetchPage(itemsRef.current.length)
      setItems(prev => [...prev, ...data])
      setHasMore(data.length === PAGE_SIZE)
    } finally {
      setLoadingMore(false)
    }
  }, [fetchPage, hasMore, loadingMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore()
    }, { rootMargin: '200px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

  async function deleteTransaction(id: string) {
    const tx = items.find(t => t.id === id)
    const result = await Swal.fire({
      title: 'ลบรายการนี้?',
      html: tx
        ? `<p><b>${tx.description}</b></p><p class="text-sm text-gray-500 mt-1">${tx.type === 'income' ? '+' : '-'}฿${tx.amount.toLocaleString()}</p>`
        : undefined,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ลบเลย',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
    })
    if (!result.isConfirmed) return

    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems(prev => prev.filter(t => t.id !== id))
      toast.success('ลบรายการแล้ว')
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || 'ลบรายการไม่สำเร็จ')
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">{t('nav.transactions')}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + {t('transaction.add')}
        </button>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 rounded-xl px-2 py-1.5 mb-4 border border-gray-100 dark:border-gray-800">
        <button
          onClick={() => setMonthOffset(o => o - 1)}
          className="px-3 py-1.5 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          aria-label="previous month"
        >
          ←
        </button>
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-800 dark:text-gray-200">{monthLabel}</span>
          {monthOffset !== 0 && (
            <button
              onClick={() => setMonthOffset(0)}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {locale === 'th' ? 'เดือนนี้' : 'This month'}
            </button>
          )}
        </div>
        <button
          onClick={() => setMonthOffset(o => Math.min(o + 1, 0))}
          disabled={monthOffset >= 0}
          className="px-3 py-1.5 text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
          aria-label="next month"
        >
          →
        </button>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-5 overflow-x-auto">
        {['', 'income', 'expense'].map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
              filterType === type
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-indigo-300'
            }`}
          >
            {type === '' ? 'ทั้งหมด' : type === 'income' ? t('transaction.income') : t('transaction.expense')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <div className="text-4xl mb-3">📭</div>
          {t('transaction.noTransactions')}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map(tx => (
              <div key={tx.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4">
                <div className="text-2xl">{tx.category.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{tx.description}</p>
                    {tx.aiGenerated && (
                      <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full flex-shrink-0">🤖 AI</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                    {tx.category.name} · {locale === 'th'
                      ? format(new Date(tx.date), 'd MMM yyyy', { locale: th })
                      : format(new Date(tx.date), 'd MMM yyyy')}
                  </p>
                  {tx.note && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{tx.note}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`font-bold ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'income' ? '+' : '-'}฿{tx.amount.toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteTransaction(tx.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors text-sm"
                  aria-label="delete"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div ref={sentinelRef} className="h-10 flex items-center justify-center mt-4 text-xs text-gray-400 dark:text-gray-500">
            {loadingMore ? t('common.loading') : !hasMore ? `— ${locale === 'th' ? 'หมดแล้ว' : 'End'} —` : ''}
          </div>
        </>
      )}

      {showModal && (
        <AddTransactionModal
          categories={categories}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); refresh() }}
        />
      )}
    </div>
  )
}
