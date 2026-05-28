'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { emitDataChanged } from '@/lib/hooks/useDataRefresh'

function renderMarkdown(text: string) {
  if (!text) return null
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') { i++; continue }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      elements.push(
        <ol key={elements.length} className="list-decimal list-inside space-y-1 my-1.5">
          {items.map((item, j) => <li key={j} className="text-sm">{renderInline(item)}</li>)}
        </ol>
      )
      continue
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s/, ''))
        i++
      }
      elements.push(
        <ul key={elements.length} className="list-disc list-inside space-y-1 my-1.5">
          {items.map((item, j) => <li key={j} className="text-sm">{renderInline(item)}</li>)}
        </ul>
      )
      continue
    }

    if (/^#{2,3}\s/.test(line)) {
      elements.push(
        <p key={elements.length} className="font-semibold text-indigo-700 dark:text-indigo-300 mt-2 mb-0.5 text-sm">
          {renderInline(line.replace(/^#{2,3}\s/, ''))}
        </p>
      )
      i++; continue
    }

    elements.push(<p key={elements.length} className="text-sm leading-relaxed">{renderInline(line)}</p>)
    i++
  }

  return elements
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part)
      ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
      : part
  )
}

interface Message {
  role: 'user' | 'ai'
  text: string
}

export default function AIChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const widgetRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function send() {
    if (!input.trim() || loading) return
    const question = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: question }])
    setLoading(true)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    try {
      const history = messages.slice(-10).map(m => ({
        role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
        content: m.text,
      }))
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, history }),
      })
      const data = await res.json()
      const text = data.reply || data.error || 'ขออภัย ตอบไม่ได้'
      setMessages(prev => [...prev, { role: 'ai', text }])
      if (data.dbChanged) {
        emitDataChanged()
        router.refresh()
      }
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่' }])
    } finally {
      setLoading(false)
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        inputRef.current?.focus()
      }, 100)
    }
  }

  function toggle() {
    setOpen(v => {
      if (!v) setTimeout(() => inputRef.current?.focus(), 200)
      return !v
    })
  }

  return (
    <>
      {/* Chat panel */}
      <div
        ref={widgetRef}
        className={`fixed bottom-20 md:bottom-24 right-2 md:right-6 z-50 w-[calc(100vw-1rem)] max-w-sm transition-all duration-300 origin-bottom-right ${
          open ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
          style={{ height: 'min(480px, calc(100dvh - 160px))' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-base">🤖</div>
              <div>
                <p className="font-semibold text-white text-sm leading-none">ผู้ช่วย AI</p>
                <p className="text-indigo-200 text-xs mt-0.5">วิเคราะห์การเงินของคุณ</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  title="ล้างการสนทนา"
                  className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                    <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scroll-smooth">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-center pb-4">
                <span className="text-4xl">💬</span>
                <p className="text-sm text-gray-500 dark:text-gray-400">ถามอะไรก็ได้เกี่ยวกับการเงินของคุณ</p>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {['เดือนนี้ใช้จ่ายอะไรมากสุด?', 'แนะนำวิธีประหยัดเงิน', 'วางแผนออมเงิน'].map(s => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus() }}
                      className="text-xs bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors border border-indigo-100 dark:border-indigo-800"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                {msg.role === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm text-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm'
                }`}>
                  {msg.role === 'ai' ? renderMarkdown(msg.text) : msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-end gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 flex-shrink-0">
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-transparent transition-all">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                placeholder="พิมพ์คำถาม..."
                className="flex-1 bg-transparent text-sm focus:outline-none text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
              />
              <button
                onClick={send}
                disabled={loading || !input.trim()}
                className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.288Z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FAB toggle button — hidden when panel is open */}
      {!open && (
        <button
          onClick={toggle}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 w-14 h-14 rounded-full shadow-lg bg-indigo-600 hover:bg-indigo-700 hover:scale-105 flex items-center justify-center transition-all duration-200"
          aria-label="เปิด AI Chat"
        >
          <span className="text-2xl">🤖</span>
        </button>
      )}
    </>
  )
}
