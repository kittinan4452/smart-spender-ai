'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { OPENROUTER_FREE_TEXT_MODELS, OPENROUTER_DEFAULT_TEXT_MODEL, OPENROUTER_DEFAULT_VISION_MODEL, OPENROUTER_FREE_MODELS } from '@/lib/ai/providers'

interface UserSettings {
  name: string
  email: string
  language: string
  currency: string
  aiProvider: string
  aiModel: string | null
  aiApiKey: string | null
}


export default function SettingsPage() {
  const t = useTranslations('settings')
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/settings', { signal: ac.signal })
      .then(r => r.ok ? r.json() : null).then(d => d && setSettings(d))
      .catch(e => { if (e.name !== 'AbortError') console.error(e) })
    return () => ac.abort()
  }, [])

  async function handleSave() {
    if (!settings) return
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) return <div className="p-6 text-center text-gray-400 dark:text-gray-500">กำลังโหลด...</div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">{t('title')}</h1>

      <div className="space-y-5">
        {/* Profile */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">👤 {t('profile')}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ชื่อ</label>
              <input
                type="text"
                value={settings.name || ''}
                onChange={e => setSettings({ ...settings, name: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">อีเมล</label>
              <input
                type="email"
                value={settings.email}
                disabled
                className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>
        </div>

        {/* Language & Currency */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-4">🌐 ภาษา & สกุลเงิน</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('language')}</label>
              <select
                value={settings.language}
                onChange={e => setSettings({ ...settings, language: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="th">ภาษาไทย</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('currency')}</label>
              <select
                value={settings.currency}
                onChange={e => setSettings({ ...settings, currency: e.target.value })}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="THB">THB (฿)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>
        </div>

        {/* AI Settings */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">🤖 {t('aiProvider')}</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">ใช้ OpenRouter — ฟรี, อ่านภาพด้วย Gemma, วิเคราะห์ข้อความด้วย DeepSeek</p>

          {/* Vision model — fixed */}
          <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-0.5">📷 อ่านภาพสลิป (อัตโนมัติ)</p>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              {OPENROUTER_FREE_MODELS.find(m => m.id === OPENROUTER_DEFAULT_VISION_MODEL)?.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {OPENROUTER_FREE_MODELS.find(m => m.id === OPENROUTER_DEFAULT_VISION_MODEL)?.description}
            </p>
          </div>

          {/* Text model — user-selectable */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              💬 วิเคราะห์ข้อความ <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">(เลือกได้)</span>
            </label>
            <div className="space-y-2">
              {OPENROUTER_FREE_TEXT_MODELS.map(m => (
                <label
                  key={m.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    (settings.aiModel || OPENROUTER_DEFAULT_TEXT_MODEL) === m.id
                      ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950'
                      : 'border-gray-200 dark:border-gray-700 hover:border-indigo-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="aiModel"
                    value={m.id}
                    checked={(settings.aiModel || OPENROUTER_DEFAULT_TEXT_MODEL) === m.id}
                    onChange={e => setSettings({ ...settings, aiModel: e.target.value })}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{m.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{m.description}</p>
                  </div>
                  {m.vision && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">📷</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('apiKey')} <span className="text-gray-400 dark:text-gray-500 font-normal">(ถ้าต้องการใช้ key ของตัวเอง)</span>
            </label>
            <input
              type="password"
              value={settings.aiApiKey || ''}
              onChange={e => setSettings({ ...settings, aiApiKey: e.target.value })}
              placeholder="sk-or-v1-..."
              className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">ถ้าไม่ใส่ จะใช้ key จาก server (ถ้ามี)</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors"
        >
          {saved ? '✓ ' + t('saved') : saving ? '...' : t('save')}
        </button>
      </div>
    </div>
  )
}
