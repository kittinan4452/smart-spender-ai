'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: string
  isDefault: boolean
}

interface Allocation {
  categoryId: string
  categoryName: string
  amount: number
  reason: string
}

interface PlanResult {
  summary: string
  savingsAmount: number
  allocations: Allocation[]
}

interface Props {
  month: number
  year: number
  onClose: () => void
  onApply: (allocations: Allocation[]) => void
}

function formatAmount(raw: string): string {
  if (!raw) return ''
  const [int, dec] = raw.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec !== undefined ? `${formatted}.${dec}` : formatted
}

type Step = 'pick' | 'review'

export default function AIPlanModal({ month, year, onClose, onApply }: Props) {
  const [step, setStep] = useState<Step>('pick')
  const [income, setIncome] = useState('')
  const [savingsGoalPct, setSavingsGoalPct] = useState('20')
  const [categories, setCategories] = useState<Category[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PlanResult | null>(null)
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.ok ? r.json() : [])
      .then((cats: Category[]) => setCategories(cats.filter(c => c.type === 'expense')))
      .catch(() => {})
  }, [])

  const incomeNum = parseFloat(income.replace(/,/g, '')) || 0
  const savingsBaht = Math.round(incomeNum * parseInt(savingsGoalPct) / 100)
  const spendable = Math.max(0, incomeNum - savingsBaht)

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(categories.map(c => c.id)))
  }
  function clearAll() {
    setSelected(new Set())
  }

  async function analyze() {
    if (!incomeNum || incomeNum <= 0) {
      toast.error('กรุณากรอกรายได้ที่ถูกต้อง')
      return
    }
    if (selected.size === 0) {
      toast.error('กรุณาเลือกอย่างน้อย 1 หมวด')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/ai/budget-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          income: incomeNum,
          savingsGoalPct: parseInt(savingsGoalPct),
          month,
          year,
          categoryIds: Array.from(selected),
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'วิเคราะห์ไม่สำเร็จ'); return }
      setResult(data)
      const initEdits: Record<string, string> = {}
      for (const a of data.allocations) initEdits[a.categoryId] = String(a.amount)
      setEdited(initEdits)
      setStep('review')
    } catch {
      toast.error('เชื่อมต่อ AI ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  async function handleApply() {
    if (!result) return
    const allocations = result.allocations.map(a => ({
      ...a,
      amount: parseFloat((edited[a.categoryId] ?? '').replace(/,/g, '')) || 0,
    })).filter(a => a.amount > 0)

    if (allocations.length === 0) {
      toast.error('กรุณาใส่จำนวนเงินอย่างน้อย 1 หมวด')
      return
    }

    setApplying(true)
    try {
      await Promise.all(allocations.map(a =>
        fetch('/api/budgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId: a.categoryId, amount: a.amount, month, year }),
        })
      ))
      toast.success(`ตั้งงบ ${allocations.length} หมวดแล้ว`)
      onApply(allocations)
      onClose()
    } catch {
      toast.error('บันทึกงบไม่สำเร็จ')
    } finally {
      setApplying(false)
    }
  }

  const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

  const totalAllocated = useMemo(() => {
    if (!result) return 0
    return result.allocations.reduce((s, a) => {
      const v = parseFloat((edited[a.categoryId] ?? '').replace(/,/g, '')) || 0
      return s + v
    }, 0)
  }, [result, edited])

  const overSpendable = result ? totalAllocated > spendable : false

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">🤖 วางแผนงบด้วย AI</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {step === 'pick' ? 'เลือกหมวดที่ต้องการตั้งงบ — AI จะแนะนำจำนวนเงินให้' : 'ตรวจสอบและปรับแก้จำนวนเงินก่อนบันทึก'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400">✕</button>
        </div>

        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-indigo-100 dark:border-indigo-900 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-indigo-600 rounded-full animate-spin" />
              <span className="absolute inset-0 flex items-center justify-center text-2xl">🤖</span>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-800 dark:text-gray-100">AI กำลังวิเคราะห์...</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                กำลังจัดสรรงบ {selected.size} หมวดจากพฤติกรรมจริงของคุณ
              </p>
            </div>
          </div>
        )}

        {!loading && step === 'pick' && (
          <>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
              {/* Income */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">รายได้เดือนนี้ (฿)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formatAmount(income)}
                  onChange={e => {
                    const raw = e.target.value.replace(/,/g, '')
                    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setIncome(raw)
                  }}
                  placeholder="เช่น 30,000"
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>

              {/* Savings */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  เป้าหมายเงินเก็บ: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{savingsGoalPct}%</span>
                  {incomeNum > 0 && <span className="text-gray-400 ml-1">(฿{fmt(savingsBaht)})</span>}
                </label>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={savingsGoalPct}
                  onChange={e => setSavingsGoalPct(e.target.value)}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>0%</span><span>10%</span><span>20%</span><span>30%</span><span>40%</span><span>50%</span>
                </div>
              </div>

              {/* Category picker */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    เลือกหมวด <span className="text-gray-400">({selected.size}/{categories.length})</span>
                  </label>
                  <div className="flex gap-2 text-xs">
                    <button onClick={selectAll} className="text-indigo-600 dark:text-indigo-400 hover:underline">เลือกทั้งหมด</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={clearAll} className="text-gray-500 dark:text-gray-400 hover:underline">ล้าง</button>
                  </div>
                </div>
                {categories.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">กำลังโหลดหมวด...</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {categories.map(c => {
                      const on = selected.has(c.id)
                      return (
                        <button
                          key={c.id}
                          onClick={() => toggle(c.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors text-left ${
                            on
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-400'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'
                          }`}
                        >
                          <span className="text-lg">{c.icon}</span>
                          <span className={`flex-1 truncate ${on ? 'text-indigo-700 dark:text-indigo-300 font-medium' : 'text-gray-700 dark:text-gray-300'}`}>{c.name}</span>
                          {on && <span className="text-indigo-600 dark:text-indigo-400">✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
              <button
                onClick={analyze}
                disabled={loading || !incomeNum || selected.size === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    AI กำลังวิเคราะห์...
                  </>
                ) : `🤖 ให้ AI แนะนำจำนวนเงิน (${selected.size} หมวด)`}
              </button>
            </div>
          </>
        )}

        {!loading && step === 'review' && result && (
          <>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              {/* Summary */}
              <div className="bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-800 rounded-2xl px-4 py-3">
                <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">✨ AI แนะนำ</p>
                <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed">{result.summary}</p>
                <div className="flex gap-4 mt-2 pt-2 border-t border-indigo-100 dark:border-indigo-800">
                  <div>
                    <p className="text-xs text-indigo-500 dark:text-indigo-400">เงินเก็บ</p>
                    <p className="text-sm font-bold text-emerald-600">฿{fmt(result.savingsAmount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-indigo-500 dark:text-indigo-400">รวมจัดสรร</p>
                    <p className={`text-sm font-bold ${overSpendable ? 'text-red-500' : 'text-indigo-700 dark:text-indigo-300'}`}>
                      ฿{fmt(totalAllocated)}
                      <span className="text-xs text-gray-400 font-normal"> / ฿{fmt(spendable)}</span>
                    </p>
                  </div>
                </div>
              </div>

              {overSpendable && (
                <div className="px-3 py-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300">
                  รวมงบเกินเงินที่ใช้ได้ — ปรับลดบางหมวดได้
                </div>
              )}

              {/* Editable allocations */}
              <div className="space-y-2">
                {result.allocations.map(a => (
                  <div key={a.categoryId} className="bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{a.categoryName}</p>
                      <div className="flex items-center gap-1 whitespace-nowrap">
                        <span className="text-xs text-gray-400">฿</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatAmount(edited[a.categoryId] ?? '')}
                          onChange={e => {
                            const raw = e.target.value.replace(/,/g, '')
                            if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
                              setEdited(prev => ({ ...prev, [a.categoryId]: raw }))
                            }
                          }}
                          className="w-28 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-sm text-right bg-white dark:bg-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{a.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 flex gap-2">
              <button
                onClick={() => { setStep('pick'); setResult(null) }}
                disabled={applying}
                className="px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                ← ย้อน
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-semibold transition-colors"
              >
                {applying ? 'กำลังบันทึก...' : '✓ บันทึกแผนนี้'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
