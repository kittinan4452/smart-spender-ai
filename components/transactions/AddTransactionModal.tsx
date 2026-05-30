'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { AI_PROVIDERS, AIProvider } from '@/lib/ai/providers'

interface Category {
  id: string
  name: string
  nameEn: string | null
  icon: string
  type: string
}

interface Props {
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}

type Mode = 'manual' | 'ai'

interface AIResult {
  type: 'income' | 'expense'
  amount: number
  description: string
  categoryId: string
  category: { name: string; icon: string }
  confidence: number
}

export default function AddTransactionModal({ categories, onClose, onSaved }: Props) {
  const t = useTranslations('transaction')

  function formatAmount(raw: string): string {
    if (!raw) return ''
    const [int, dec] = raw.split('.')
    const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return dec !== undefined ? `${formatted}.${dec}` : formatted
  }

  const [mode, setMode] = useState<Mode>('manual')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [aiText, setAiText] = useState('')
  const [aiImage, setAiImage] = useState<{ base64: string; mimeType: string; preview: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AIResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [userProvider, setUserProvider] = useState<AIProvider | null>(null)
  const [listening, setListening] = useState(false)
  const [includeVat, setIncludeVat] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const VAT_RATE = 0.07
  const parsedAmount = parseFloat(amount) || 0
  const vatAmount = includeVat && parsedAmount > 0
    ? parseFloat((parsedAmount * VAT_RATE / (1 + VAT_RATE)).toFixed(2))
    : 0
  const priceBeforeVat = includeVat && parsedAmount > 0
    ? parseFloat((parsedAmount - vatAmount).toFixed(2))
    : 0
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const rec = new SpeechRecognition()
    rec.lang = 'th-TH'
    rec.interimResults = false
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript
      setAiText(prev => (prev ? prev + ' ' + text : text))
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  useEffect(() => {
    if (mode === 'ai' && !userProvider) {
      fetch('/api/settings')
        .then(r => r.ok ? r.json() : null)
        .then(d => d?.aiProvider && setUserProvider(d.aiProvider as AIProvider))
        .catch(() => {})
    }
  }, [mode])

  const providerInfo = userProvider ? AI_PROVIDERS.find(p => p.id === userProvider) : null
  const visionWarning = aiImage && providerInfo && !providerInfo.vision

  const filteredCategories = categories.filter(c => c.type === type)

  function readImageFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('รองรับเฉพาะไฟล์รูปภาพ')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      const base64 = dataUrl.split(',')[1]
      setAiImage({ base64, mimeType: file.type, preview: dataUrl })
      toast.success('โหลดรูปแล้ว กด "วิเคราะห์ด้วย AI" ได้เลย')
    }
    reader.readAsDataURL(file)
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (imageItem) {
      e.preventDefault()
      const file = imageItem.getAsFile()
      if (file) readImageFile(file)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) readImageFile(file)
  }, [])

  async function analyzeWithAI() {
    if (!aiText.trim() && !aiImage) return
    setAiLoading(true)
    setAiResult(null)

    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiText,
          imageBase64: aiImage?.base64,
          mimeType: aiImage?.mimeType,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setAiResult(data)
        setType(data.type)
        setAmount(String(data.amount))
        setDescription(data.description)
        setCategoryId(data.categoryId || '')
        if (data.visionFallback) {
          const fallbackName = AI_PROVIDERS.find(p => p.id === data.visionFallback)?.name ?? data.visionFallback
          toast.success(`AI วิเคราะห์เสร็จแล้ว (ใช้ ${fallbackName === 'Google Gemini' ? 'Google' : fallbackName} แทน เพราะไม่รองรับภาพ)`)
        } else {
          toast.success('AI วิเคราะห์เสร็จแล้ว')
        }
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'AI วิเคราะห์ไม่สำเร็จ')
      }
    } catch (e) {
      console.error(e)
      toast.error('เชื่อมต่อ AI ไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setAiLoading(false)
    }
  }

  function resetForm() {
    setAmount('')
    setDescription('')
    setCategoryId('')
    setDate(format(new Date(), 'yyyy-MM-dd'))
    setNote('')
    setAiText('')
    setAiImage(null)
    setAiResult(null)
  }

  async function handleSave(andAddAnother = false) {
    const parsedAmount = parseFloat(amount)
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error(t('invalidAmount'))
      return
    }
    if (!categoryId) return
    setSaving(true)

    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parsedAmount,
          type,
          description,
          categoryId,
          date,
          note: note || undefined,
          aiGenerated: mode === 'ai',
          rawInput: mode === 'ai' ? (aiText || 'image') : undefined,
        }),
      })

      if (res.ok) {
        if (andAddAnother) {
          toast.success('บันทึกแล้ว — เพิ่มรายการต่อไปได้เลย')
          resetForm()
          onSaved()
        } else {
          toast.success('บันทึกรายการแล้ว')
          onSaved()
        }
      } else {
        toast.error('บันทึกไม่สำเร็จ')
      }
    } catch (e) {
      console.error(e)
      toast.error('เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 pb-24 md:pb-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] md:max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{t('add')}</h2>
            <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl">✕</button>
          </div>

          {/* Mode Toggle */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-5">
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-white dark:bg-gray-700 shadow text-indigo-700 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
            >
              ✏️ {t('addManual')}
            </button>
            <button
              onClick={() => setMode('ai')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'ai' ? 'bg-white dark:bg-gray-700 shadow text-indigo-700 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}
            >
              🤖 {t('addAI')}
            </button>
          </div>

          {/* AI Mode */}
          {mode === 'ai' && (
            <div className="mb-5 space-y-3">
              {/* Image drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onPaste={handlePaste}
                onClick={() => !aiImage && fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
                  dragOver
                    ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950'
                    : aiImage
                    ? 'border-green-400 bg-green-50 dark:bg-green-950'
                    : 'border-gray-300 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                }`}
              >
                {aiImage ? (
                  <div className="relative">
                    <img src={aiImage.preview} alt="preview" className="w-full max-h-48 object-contain rounded-xl p-2" />
                    <button
                      onClick={e => { e.stopPropagation(); setAiImage(null) }}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <p className="text-2xl mb-1">📷</p>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">วางรูปสลิป / ใบเสร็จ</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Ctrl+V วาง · ลากวาง · หรือกดเลือกไฟล์</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) readImageFile(e.target.files[0]) }} />
              </div>

              {/* Vision warning */}
              {visionWarning && (
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5">
                  <span className="text-base flex-shrink-0">⚠️</span>
                  <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                    <span className="font-semibold">{providerInfo!.name}</span> ไม่รองรับการอ่านภาพ
                    {' '}ระบบจะใช้ Google หรือ OpenRouter วิเคราะห์ภาพแทนโดยอัตโนมัติ
                  </p>
                </div>
              )}

              {/* Text input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  หรือพิมพ์/พูดอธิบาย <span className="text-gray-400 font-normal">(ไม่บังคับ)</span>
                </label>
                <div className="relative">
                  <textarea
                    value={aiText}
                    onChange={e => setAiText(e.target.value)}
                    onPaste={handlePaste}
                    placeholder={listening ? 'กำลังฟัง...' : t('aiPlaceholder')}
                    rows={2}
                    className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                  />
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`absolute right-2 top-2 w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                      listening
                        ? 'bg-red-500 text-white animate-pulse'
                        : 'text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950'
                    }`}
                    aria-label={listening ? 'หยุดฟัง' : 'พูด'}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                      <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
                    </svg>
                  </button>
                </div>
              </div>

              <button
                onClick={analyzeWithAI}
                disabled={aiLoading || (!aiText.trim() && !aiImage)}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
              >
                {aiLoading ? '🤖 ' + t('aiAnalyzing') : '🤖 ' + t('aiAnalyze')}
              </button>

              {aiResult && (
                <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
                  <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-2">✨ AI วิเคราะห์แล้ว — ตรวจสอบและแก้ไขได้ด้านล่าง</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span>{aiResult.category?.icon}</span>
                    <span className="font-medium dark:text-gray-200">{aiResult.description}</span>
                    <span className={`ml-auto font-bold ${aiResult.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                      {aiResult.type === 'income' ? '+' : '-'}฿{aiResult.amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Common Form Fields */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => { setType('expense'); setCategoryId('') }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border ${type === 'expense' ? 'bg-red-50 border-red-300 text-red-700' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}
              >
                💸 {t('expense')}
              </button>
              <button
                onClick={() => { setType('income'); setCategoryId('') }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors border ${type === 'income' ? 'bg-green-50 border-green-300 text-green-700' : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}
              >
                💵 {t('income')}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('amount')} (฿) <span className="text-red-500">*</span></label>
              <input
                type="text"
                inputMode="decimal"
                value={formatAmount(amount)}
                onChange={e => {
                  const raw = e.target.value.replace(/,/g, '')
                  if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw)
                }}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
                placeholder="0.00"
              />
              {type === 'expense' && (
                <div className="mt-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                    <input
                      type="checkbox"
                      checked={includeVat}
                      onChange={e => setIncludeVat(e.target.checked)}
                      className="w-4 h-4 rounded accent-indigo-600"
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">มี VAT 7% รวมอยู่ในยอดนี้</span>
                  </label>
                  {includeVat && parsedAmount > 0 && (
                    <div className="mt-1.5 flex gap-3 text-xs bg-indigo-50 dark:bg-indigo-950 rounded-lg px-3 py-2 text-indigo-700 dark:text-indigo-300">
                      <span>ราคาก่อน VAT: <strong>฿{priceBeforeVat.toLocaleString()}</strong></span>
                      <span className="text-indigo-400">|</span>
                      <span>VAT 7%: <strong>฿{vatAmount.toLocaleString()}</strong></span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('description')} <span className="text-gray-400 font-normal">({t('optional')})</span></label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('category')} <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                {filteredCategories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryId(cat.id)}
                    className={`p-2 rounded-xl text-xs border transition-colors text-center ${
                      categoryId === cat.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:text-gray-300'
                    }`}
                  >
                    <div className="text-xl mb-1">{cat.icon}</div>
                    <div className="truncate">{cat.name}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('date')}</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('note')} <span className="text-gray-400 font-normal">(ไม่บังคับ)</span></label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-6">
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => handleSave(false)}
                disabled={saving || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0 || !categoryId}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-medium transition-colors"
              >
                {saving ? '...' : t('save')}
              </button>
            </div>
            <button
              onClick={() => handleSave(true)}
              disabled={saving || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0 || !categoryId}
              className="w-full border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 rounded-xl py-2.5 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950 disabled:opacity-50 transition-colors"
            >
              {saving ? '...' : t('saveAndAddAnother')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
