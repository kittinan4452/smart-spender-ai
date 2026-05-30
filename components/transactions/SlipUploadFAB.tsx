'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { emitDataChanged } from '@/lib/hooks/useDataRefresh'

interface Category {
  id: string
  name: string
  icon: string
  type: string
}

interface AnalyzedResult {
  type: 'income' | 'expense'
  amount: number
  description: string
  categoryName: string
  date?: string
  note?: string
  confidence: number
  categoryId?: string
  category?: Category
}

type Step = 'pick' | 'analyzing' | 'review'

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const [meta, data] = result.split(',')
      const mimeType = meta.match(/data:(.*?);base64/)?.[1] || file.type || 'image/png'
      resolve({ base64: data, mimeType })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function todayISO() {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

function formatAmount(raw: string): string {
  if (!raw) return ''
  const [int, dec] = raw.split('.')
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec !== undefined ? `${formatted}.${dec}` : formatted
}

export default function SlipUploadFAB() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('pick')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzedResult | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [saving, setSaving] = useState(false)

  // editable fields
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')

  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.ok ? r.json() : [])
      .then(setCategories)
      .catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // Escape to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving && step !== 'analyzing') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, saving, step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Paste from clipboard
  useEffect(() => {
    if (!open || step !== 'pick') return
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            handleFile(file)
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open, step]) // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    setStep('pick')
    setPreviewUrl(null)
    setResult(null)
    setAmount('')
    setDescription('')
    setCategoryId('')
    setType('expense')
    setDate(todayISO())
    setNote('')
  }

  function close() {
    setOpen(false)
    setTimeout(reset, 200)
  }

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('กรุณาเลือกไฟล์รูปภาพ')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('รูปใหญ่เกิน 8MB')
      return
    }

    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setStep('analyzing')

    try {
      const { base64, mimeType } = await fileToBase64(file)
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'วิเคราะห์สลิปไม่สำเร็จ')
        setStep('pick')
        return
      }

      setResult(data)
      setAmount(String(data.amount ?? ''))
      setDescription(data.description ?? '')
      setCategoryId(data.categoryId ?? '')
      setType(data.type ?? 'expense')
      setDate(data.date ?? todayISO())
      setNote(data.note ?? '')
      setStep('review')
    } catch {
      toast.error('เชื่อมต่อ AI ไม่สำเร็จ')
      setStep('pick')
    }
  }

  async function save() {
    const amountNum = parseFloat(amount.replace(/,/g, ''))
    if (!amountNum || amountNum <= 0) { toast.error('กรุณากรอกจำนวนเงิน'); return }
    if (!categoryId) { toast.error('กรุณาเลือกหมวด'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          type,
          description: description.trim(),
          categoryId,
          date: new Date(date).toISOString(),
          note: note.trim() || undefined,
          aiGenerated: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'บันทึกไม่สำเร็จ')
        return
      }
      toast.success('บันทึกรายการแล้ว')
      emitDataChanged()
      close()
    } catch {
      toast.error('บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const filteredCats = categories.filter(c => c.type === type)

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        aria-label="อัปสลิป"
        className="fixed bottom-36 md:bottom-24 right-4 md:right-6 z-40 w-14 h-14 rounded-full shadow-lg bg-emerald-600 hover:bg-emerald-700 hover:scale-105 flex items-center justify-center transition-all duration-200 text-2xl"
      >
        📷
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4"
          onClick={() => { if (!saving && step !== 'analyzing') close() }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92dvh] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">📷 อัปสลิป / ใบเสร็จ</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {step === 'pick' && 'AI จะดึงข้อมูลให้อัตโนมัติ'}
                  {step === 'analyzing' && 'กำลังวิเคราะห์...'}
                  {step === 'review' && 'ตรวจสอบและแก้ไขก่อนบันทึก'}
                </p>
              </div>
              <button onClick={close} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400">✕</button>
            </div>

            {/* Pick step */}
            {step === 'pick' && (
              <div className="overflow-y-auto flex-1 px-5 py-6 space-y-3">
                <button
                  onClick={() => cameraInput.current?.click()}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition"
                >
                  <span className="text-3xl">📸</span>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">ถ่ายรูปสลิป</p>
                    <p className="text-xs text-gray-400">เปิดกล้องและถ่ายทันที</p>
                  </div>
                </button>

                <button
                  onClick={() => galleryInput.current?.click()}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition"
                >
                  <span className="text-3xl">🖼️</span>
                  <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">เลือกจากแกลเลอรี</p>
                    <p className="text-xs text-gray-400">รูปที่บันทึกไว้แล้ว</p>
                  </div>
                </button>

                <div className="hidden md:block px-5 py-3 rounded-2xl bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    หรือกด <kbd className="px-1.5 py-0.5 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded">Ctrl+V</kbd> เพื่อวางรูปจากคลิปบอร์ด
                  </p>
                </div>

                <input
                  ref={cameraInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
                />
                <input
                  ref={galleryInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
                />
              </div>
            )}

            {/* Analyzing step */}
            {step === 'analyzing' && (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-4">
                {previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="preview" className="max-h-48 rounded-xl shadow-md opacity-70" />
                )}
                <div className="relative">
                  <div className="w-14 h-14 border-4 border-emerald-100 dark:border-emerald-900 rounded-full" />
                  <div className="absolute inset-0 w-14 h-14 border-4 border-transparent border-t-emerald-600 rounded-full animate-spin" />
                </div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">AI กำลังอ่านสลิป...</p>
              </div>
            )}

            {/* Review step */}
            {step === 'review' && result && (
              <>
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
                  {previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="slip" className="max-h-40 mx-auto rounded-xl shadow-sm" />
                  )}

                  {result.confidence < 0.7 && (
                    <div className="px-3 py-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-xl text-xs text-yellow-700 dark:text-yellow-300">
                      ⚠️ AI ไม่มั่นใจในผลลัพธ์ ({Math.round(result.confidence * 100)}%) — ตรวจสอบให้ดีก่อนบันทึก
                    </div>
                  )}

                  {/* Type */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setType('expense')}
                      className={`py-2 rounded-xl text-sm font-semibold transition ${type === 'expense' ? 'bg-red-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
                    >รายจ่าย</button>
                    <button
                      onClick={() => setType('income')}
                      className={`py-2 rounded-xl text-sm font-semibold transition ${type === 'income' ? 'bg-emerald-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
                    >รายรับ</button>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">จำนวนเงิน (฿) <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={formatAmount(amount)}
                      onChange={e => {
                        const raw = e.target.value.replace(/,/g, '')
                        if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw)
                      }}
                      className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">รายละเอียด <span className="text-gray-400 font-normal">(ไม่บังคับ)</span></label>
                    <input
                      type="text"
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">หมวด <span className="text-red-500">*</span></label>
                    <select
                      value={categoryId}
                      onChange={e => setCategoryId(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-800 dark:text-gray-100"
                    >
                      <option value="">-- เลือกหมวด --</option>
                      {filteredCats.map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">วันที่</label>
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">หมายเหตุ (ไม่บังคับ)</label>
                    <textarea
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      rows={2}
                      className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-gray-800 dark:text-gray-100 resize-none"
                    />
                  </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex-shrink-0 flex gap-2">
                  <button
                    onClick={reset}
                    disabled={saving}
                    className="px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                  >อัปใหม่</button>
                  <button
                    onClick={save}
                    disabled={saving}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-semibold transition-colors"
                  >
                    {saving ? 'กำลังบันทึก...' : '✓ บันทึกรายการ'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
