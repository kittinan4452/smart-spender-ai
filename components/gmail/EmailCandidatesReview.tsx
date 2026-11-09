'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Swal from 'sweetalert2'
import { toast } from 'sonner'
import { emitDataChanged } from '@/lib/hooks/useDataRefresh'

interface Candidate {
  id: string
  type: string
  amount: number
  description: string
  categoryName: string
  matchedCategoryId: string | null
  date: string
  confidence: number
  rawSnippet: string
  lowConfidence: boolean
  duplicateOf: { kind: 'transaction' | 'candidate'; description: string; date: string } | null
}

interface Category {
  id: string
  name: string
  icon: string
  type: string
}

interface Props {
  month: number
  year: number
  reloadToken?: number
}

type Action = 'confirm' | 'dismiss' | 'restore'

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
const fmtMoney = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 })

/** Pre-select only candidates that look safe to confirm without a closer look. */
const isRecommended = (c: Candidate) => !c.duplicateOf && !c.lowConfidence

export default function EmailCandidatesReview({ month, year, reloadToken }: Props) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [categoryOverride, setCategoryOverride] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  // Ids we've already applied the default selection to, so a reload doesn't override the user's ticks.
  const seen = useRef<Set<string>>(new Set())

  const load = useCallback(() => {
    return fetch(`/api/gmail/candidates?month=${month}&year=${year}`)
      .then(r => (r.ok ? r.json() : []))
      .then((d: unknown) => {
        const list = Array.isArray(d) ? (d as Candidate[]) : []
        setCandidates(list)
        setSelected(prev => {
          const ids = new Set(list.map(c => c.id))
          const next = new Set([...prev].filter(id => ids.has(id)))
          for (const c of list) {
            if (!seen.current.has(c.id)) {
              seen.current.add(c.id)
              if (isRecommended(c)) next.add(c.id)
            }
          }
          return next
        })
      })
  }, [month, year])

  useEffect(() => {
    load()
  }, [load, reloadToken])

  useEffect(() => {
    fetch('/api/categories')
      .then(r => (r.ok ? r.json() : []))
      .then(d => setCategories(Array.isArray(d) ? d : []))
  }, [])

  const list = useMemo(() => candidates ?? [], [candidates])
  const selectedList = list.filter(c => selected.has(c.id))
  const allSelected = list.length > 0 && selectedList.length === list.length
  const recommendedCount = list.filter(isRecommended).length

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(list.map(c => c.id)))
  }

  function selectRecommended() {
    setSelected(new Set(list.filter(isRecommended).map(c => c.id)))
  }

  async function post(action: Action, ids: string[]) {
    const overrides: Record<string, { categoryId: string }> = {}
    if (action === 'confirm') {
      for (const id of ids) if (categoryOverride[id]) overrides[id] = { categoryId: categoryOverride[id] }
    }
    const res = await fetch('/api/gmail/candidates/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids, overrides }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.ok) throw new Error(data.error || 'ทำรายการไม่สำเร็จ')
    return data as { confirmed?: number; dismissed?: number; restored?: number; skipped?: number }
  }

  async function undo(ids: string[]) {
    try {
      await post('restore', ids)
      toast.success('เลิกทำแล้ว')
      await load()
      emitDataChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'เลิกทำไม่สำเร็จ')
    }
  }

  async function run(action: 'confirm' | 'dismiss', items: Candidate[]) {
    if (items.length === 0 || busy) return
    const ids = items.map(c => c.id)

    if (action === 'confirm' && items.length > 1) {
      const expense = items.filter(c => c.type === 'expense').reduce((s, c) => s + c.amount, 0)
      const income = items.filter(c => c.type === 'income').reduce((s, c) => s + c.amount, 0)
      const dupes = items.filter(c => c.duplicateOf).length
      const result = await Swal.fire({
        title: `บันทึก ${items.length} รายการ?`,
        html:
          `<div style="text-align:left;line-height:1.8">` +
          (expense ? `รายจ่ายรวม <b style="color:#ef4444">฿${fmtMoney(expense)}</b><br>` : '') +
          (income ? `รายรับรวม <b style="color:#16a34a">฿${fmtMoney(income)}</b><br>` : '') +
          (dupes ? `<span style="color:#d97706">⚠️ มี ${dupes} รายการที่อาจซ้ำกับรายการเดิม</span>` : '') +
          `</div>`,
        icon: dupes ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#6b7280',
      })
      if (!result.isConfirmed) return
    }

    setBusy(true)
    try {
      const r = await post(action, ids)
      const done = action === 'confirm' ? r.confirmed ?? 0 : r.dismissed ?? 0
      const label = action === 'confirm' ? `บันทึก ${done} รายการแล้ว` : `ซ่อน ${done} รายการแล้ว`
      toast.success(label, {
        description: r.skipped ? `ข้าม ${r.skipped} รายการที่ถูกจัดการไปแล้ว` : undefined,
        duration: 8000,
        action: done ? { label: 'เลิกทำ', onClick: () => undo(ids) } : undefined,
      })
      setSelected(prev => new Set([...prev].filter(id => !ids.includes(id))))
      await load()
      if (action === 'confirm') emitDataChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (candidates === null) {
    return <div className="text-center py-16 text-gray-400 dark:text-gray-500">กำลังโหลด...</div>
  }

  if (list.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <div className="text-4xl mb-3">📭</div>
        ไม่มีรายการที่ตรวจพบจากอีเมลเดือนนี้
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Bulk action bar — sticks below the mobile header while scrolling */}
      <div className="sticky top-12 md:top-0 z-30 flex flex-wrap items-center justify-between gap-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur rounded-2xl px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              ref={el => {
                if (el) el.indeterminate = selectedList.length > 0 && !allSelected
              }}
              onChange={toggleAll}
              className="w-4 h-4 accent-indigo-600"
            />
            เลือกทั้งหมด ({list.length})
          </label>
          {recommendedCount < list.length && (
            <button onClick={selectRecommended} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
              เลือกเฉพาะที่ไม่ซ้ำ
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => run('dismiss', selectedList)}
            disabled={busy || selectedList.length === 0}
            className="text-sm border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-gray-600 dark:text-gray-300 disabled:opacity-40 transition-colors"
          >
            ไม่ใช่ ({selectedList.length})
          </button>
          <button
            onClick={() => run('confirm', selectedList)}
            disabled={busy || selectedList.length === 0}
            className="text-sm bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-medium rounded-xl px-4 py-2 transition-colors"
          >
            {busy ? 'กำลังบันทึก...' : `ยืนยัน ${selectedList.length} รายการ`}
          </button>
        </div>
      </div>

      {list.map(c => {
        const cats = categories.filter(cat => cat.type === c.type)
        const isOpen = expanded.has(c.id)
        const isSelected = selected.has(c.id)
        return (
          <div
            key={c.id}
            className={`bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border transition-colors ${
              isSelected ? 'border-indigo-300 dark:border-indigo-700' : 'border-gray-100 dark:border-gray-800'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(c.id)}
                className="w-4 h-4 mt-1 accent-indigo-600 shrink-0"
                aria-label={`เลือก ${c.description}`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-gray-800 dark:text-gray-200 break-words">{c.description}</p>
                  <span
                    className={`font-semibold whitespace-nowrap ${c.type === 'income' ? 'text-green-600' : 'text-red-500'}`}
                  >
                    {c.type === 'income' ? '+' : '-'}฿{fmtMoney(c.amount)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <span>{fmtDate(c.date)}</span>
                  <span>·</span>
                  <select
                    value={categoryOverride[c.id] ?? c.matchedCategoryId ?? ''}
                    onChange={e => setCategoryOverride(prev => ({ ...prev, [c.id]: e.target.value }))}
                    className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-700 dark:text-gray-300 max-w-[12rem]"
                    aria-label="หมวดหมู่"
                  >
                    {!c.matchedCategoryId && <option value="">อัตโนมัติ ({c.categoryName})</option>}
                    {cats.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                  {c.lowConfidence && (
                    <span className="text-amber-600 dark:text-amber-400">
                      ⚠️ ความมั่นใจ {Math.round(c.confidence * 100)}%
                    </span>
                  )}
                </div>

                {c.duplicateOf && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    ⚠️ อาจซ้ำกับ{c.duplicateOf.kind === 'transaction' ? 'รายการที่บันทึกไว้' : 'อีเมลอีกฉบับ'} “
                    {c.duplicateOf.description}” ({fmtDate(c.duplicateOf.date)})
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 mt-2">
                  <button
                    onClick={() =>
                      setExpanded(prev => {
                        const next = new Set(prev)
                        if (next.has(c.id)) next.delete(c.id)
                        else next.add(c.id)
                        return next
                      })
                    }
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {isOpen ? '▾ ซ่อนข้อความอีเมล' : '▸ ดูข้อความอีเมล'}
                  </button>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => run('dismiss', [c])}
                      disabled={busy}
                      className="text-xs border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-500 dark:text-gray-400 disabled:opacity-40 transition-colors"
                    >
                      ไม่ใช่
                    </button>
                    <button
                      onClick={() => run('confirm', [c])}
                      disabled={busy}
                      className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-lg px-2.5 py-1.5 transition-colors"
                    >
                      ยืนยัน
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <p className="mt-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                    {c.rawSnippet}
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
