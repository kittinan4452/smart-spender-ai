'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import Swal from 'sweetalert2'
import AddTransactionModal from '@/components/transactions/AddTransactionModal'
import { useDataRefresh } from '@/lib/hooks/useDataRefresh'

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

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [showModal, setShowModal] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [loading, setLoading] = useState(true)

  const loadTransactions = useCallback(async (signal?: AbortSignal) => {
    const url = filterType ? `/api/transactions?type=${filterType}` : '/api/transactions'
    try {
      const res = await fetch(url, { signal })
      if (res.ok) setTransactions(await res.json())
      setLoading(false)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        console.error(e)
        setLoading(false)
      }
    }
  }, [filterType])

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
    loadTransactions(ac.signal)
    return () => ac.abort()
  }, [loadTransactions])

  useDataRefresh(useCallback(() => { loadTransactions() }, [loadTransactions]))

  async function deleteTransaction(id: string) {
    const tx = transactions.find(t => t.id === id)
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
      setTransactions(prev => prev.filter(t => t.id !== id))
      toast.success('ลบรายการแล้ว')
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error || 'ลบรายการไม่สำเร็จ')
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('nav.transactions')}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + {t('transaction.add')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5">
        {['', 'income', 'expense'].map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
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
      ) : transactions.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <div className="text-4xl mb-3">📭</div>
          {t('transaction.noTransactions')}
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map(tx => (
            <div key={tx.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 flex items-center gap-4">
              <div className="text-2xl">{tx.category.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{tx.description}</p>
                  {tx.aiGenerated && (
                    <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full flex-shrink-0">🤖 AI</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {tx.category.name} · {locale === 'th'
                    ? format(new Date(tx.date), 'd MMM yyyy', { locale: th })
                    : format(new Date(tx.date), 'd MMM yyyy')}
                </p>
                {tx.note && <p className="text-xs text-gray-400 dark:text-gray-500">{tx.note}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`font-bold ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                  {tx.type === 'income' ? '+' : '-'}฿{tx.amount.toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => deleteTransaction(tx.id)}
                className="text-gray-300 hover:text-red-400 transition-colors text-sm"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddTransactionModal
          categories={categories}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadTransactions() }}
        />
      )}
    </div>
  )
}
