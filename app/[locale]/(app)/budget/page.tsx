'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useDataRefresh } from '@/lib/hooks/useDataRefresh'

interface BudgetRow {
  categoryId: string
  name: string
  nameEn: string | null
  icon: string
  color: string
  budget: number | null
  spent: number
}

interface BudgetData {
  rows: BudgetRow[]
  totalBudget: number
  totalSpent: number
  month: number
  year: number
}

const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']

function pct(spent: number, budget: number | null) {
  if (!budget) return 0
  return Math.min(Math.round((spent / budget) * 100), 100)
}

function barColor(spent: number, budget: number | null) {
  if (!budget) return 'bg-gray-200 dark:bg-gray-700'
  const p = spent / budget
  if (p >= 1) return 'bg-red-500'
  if (p >= 0.8) return 'bg-yellow-400'
  return 'bg-emerald-500'
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function BudgetPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [data, setData] = useState<BudgetData | null>(null)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const load = useCallback((m: number, y: number, signal?: AbortSignal) => {
    fetch(`/api/budgets?month=${m}&year=${y}`, { signal })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(e => { if (e?.name !== 'AbortError') console.error(e) })
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    load(month, year, ac.signal)
    return () => ac.abort()
  }, [month, year, load])

  useDataRefresh(useCallback(() => { load(month, year) }, [load, month, year]))

  async function save(categoryId: string, raw: string) {
    const amount = parseFloat(raw.replace(/,/g, ''))
    if (isNaN(amount) || amount < 0) return

    setSaving(categoryId)
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId, amount, month, year }),
      })
      if (res.ok) {
        setData(prev => {
          if (!prev) return prev
          const rows = prev.rows.map(r => r.categoryId === categoryId ? { ...r, budget: amount } : r)
          const totalBudget = rows.reduce((s, r) => s + (r.budget ?? 0), 0)
          return { ...prev, rows, totalBudget }
        })
        toast.success('บันทึกแล้ว')
      } else {
        toast.error('บันทึกไม่สำเร็จ')
      }
    } finally {
      setSaving(null)
    }
  }

  function handleChange(categoryId: string, value: string) {
    setEditing(prev => ({ ...prev, [categoryId]: value }))
    clearTimeout(debounceRef.current[categoryId])
    debounceRef.current[categoryId] = setTimeout(() => {
      save(categoryId, value)
    }, 800)
  }

  function handleBlur(categoryId: string, value: string) {
    clearTimeout(debounceRef.current[categoryId])
    save(categoryId, value)
  }

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - 1 + i)

  const totalOver = data?.rows.filter(r => r.budget && r.spent > r.budget).length ?? 0
  const totalNoBudget = data?.rows.filter(r => !r.budget).length ?? 0

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">🎯 วางแผนงบประมาณ</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">ตั้งวงเงินรายจ่ายแต่ละหมวดต่อเดือน</p>
        </div>
        <div className="flex gap-2">
          <select
            value={month}
            onChange={e => setMonth(parseInt(e.target.value))}
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {MONTHS_TH.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={e => setYear(parseInt(e.target.value))}
            className="border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400">งบรวม</p>
            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
              {data.totalBudget > 0 ? `฿${fmt(data.totalBudget)}` : '-'}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400">ใช้ไปแล้ว</p>
            <p className={`text-lg font-bold ${data.totalSpent > data.totalBudget && data.totalBudget > 0 ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
              ฿{fmt(data.totalSpent)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-sm">
            <p className="text-xs text-gray-500 dark:text-gray-400">คงเหลือ</p>
            <p className={`text-lg font-bold ${data.totalBudget > 0 && data.totalBudget - data.totalSpent < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {data.totalBudget > 0 ? `฿${fmt(Math.max(0, data.totalBudget - data.totalSpent))}` : '-'}
            </p>
          </div>
        </div>
      )}

      {/* Alerts */}
      {totalOver > 0 && (
        <div className="mb-4 px-4 py-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-2xl text-sm text-red-700 dark:text-red-300">
          เกินงบ {totalOver} หมวด — ตรวจสอบรายจ่ายด้วยนะ
        </div>
      )}

      {/* Category rows */}
      {!data ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">กำลังโหลด...</div>
      ) : (
        <div className="space-y-3">
          {data.rows.map(row => {
            const inputVal = editing[row.categoryId] ?? (row.budget != null ? String(row.budget) : '')
            const isSaving = saving === row.categoryId
            const p = pct(row.spent, row.budget)
            const over = row.budget != null && row.spent > row.budget

            return (
              <div
                key={row.categoryId}
                className={`bg-white dark:bg-gray-900 rounded-2xl p-4 border shadow-sm transition-colors ${
                  over
                    ? 'border-red-200 dark:border-red-800'
                    : 'border-gray-100 dark:border-gray-800'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{row.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">{row.name}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      ใช้ไป ฿{fmt(row.spent)}
                      {row.budget != null && <> / ฿{fmt(row.budget)}</>}
                    </p>
                  </div>
                  {over && <span className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded-full">เกินงบ</span>}
                  {row.budget != null && !over && p >= 80 && <span className="text-xs font-semibold text-yellow-600 bg-yellow-50 dark:bg-yellow-950 px-2 py-0.5 rounded-full">ใกล้เต็ม</span>}
                </div>

                {/* Progress bar */}
                <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mb-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor(row.spent, row.budget)}`}
                    style={{ width: `${p}%` }}
                  />
                </div>

                {/* Budget input */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">วงเงิน ฿</span>
                  <input
                    type="number"
                    min="0"
                    placeholder="ไม่ได้ตั้ง"
                    value={inputVal}
                    onChange={e => handleChange(row.categoryId, e.target.value)}
                    onBlur={e => handleBlur(row.categoryId, e.target.value)}
                    className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm bg-white dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-300 dark:placeholder-gray-600"
                  />
                  {isSaving && <span className="text-xs text-gray-400">...</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalNoBudget > 0 && data && data.rows.some(r => !r.budget) && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
          {totalNoBudget} หมวดยังไม่ได้ตั้งวงเงิน — พิมพ์ตัวเลขในช่องเพื่อบันทึกอัตโนมัติ
        </p>
      )}
    </div>
  )
}
