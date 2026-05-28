import { createOpenAI } from '@ai-sdk/openai'

export type AIProvider = 'openrouter'

export const OPENROUTER_DEFAULT_TEXT_MODEL = 'deepseek/deepseek-v4-flash'
export const OPENROUTER_DEFAULT_VISION_MODEL = 'google/gemini-2.5-flash-lite'

export const OPENROUTER_FREE_MODELS = [
  {
    id: 'deepseek/deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    description: 'วิเคราะห์ข้อความ, เร็ว, ภาษาไทยดี (แนะนำ)',
    vision: false,
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    description: 'Google Gemini, อ่านภาพสลิป, ฉลาด, ภาษาไทยดี',
    vision: true,
  },
  {
    id: 'nvidia/nemotron-nano-12b-v2-vl:free',
    name: 'Nemotron Nano 12B VL',
    description: 'NVIDIA, เน้นวิเคราะห์ภาพ',
    vision: true,
  },
  {
    id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
    name: 'Nemotron 3 Nano Omni 30B',
    description: 'NVIDIA reasoning, multimodal',
    vision: true,
  },
]

export const OPENROUTER_FREE_VISION_MODELS = OPENROUTER_FREE_MODELS.filter(m => m.vision)
export const OPENROUTER_FREE_TEXT_MODELS = OPENROUTER_FREE_MODELS

export const AI_PROVIDERS = [
  {
    id: 'openrouter' as AIProvider,
    name: 'OpenRouter',
    model: 'google/gemini-2.0-flash-exp:free',
    free: true,
    vision: true,
    description: 'ฟรี, รวมหลายโมเดล, แนะนำ',
    descriptionEn: 'Free, multi-model gateway, recommended',
  },
]

export function hasKey(_provider: AIProvider, userKey?: string | null): boolean {
  return !!(userKey || process.env.OPENROUTER_API_KEY)
}

export function getOpenRouterModelChain(preferred?: string | null, needsVision = false): string[] {
  const models = needsVision ? OPENROUTER_FREE_VISION_MODELS : OPENROUTER_FREE_MODELS
  const ids = models.map(m => m.id)
  const pref = preferred || (needsVision ? OPENROUTER_DEFAULT_VISION_MODEL : OPENROUTER_DEFAULT_TEXT_MODEL)
  if (!ids.includes(pref)) return ids
  return [pref, ...ids.filter(id => id !== pref)]
}

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as {
    statusCode?: number
    status?: number
    data?: { error?: { code?: number; message?: string } }
    message?: string
  }
  if (e.statusCode === 429 || e.status === 429 || e.data?.error?.code === 429) return true
  const text = `${e.message || ''} ${e.data?.error?.message || ''}`.toLowerCase()
  return /rate.?limit|too many requests|temporarily|429/.test(text)
}

export function createOpenRouterClient(apiKey?: string | null) {
  const key = apiKey || process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('ไม่มี OpenRouter API Key')
  return createOpenAI({
    apiKey: key,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: { 'HTTP-Referer': 'https://smart-spender-ai.app', 'X-Title': 'Smart Spender AI' },
  })
}

export async function runWithOpenRouterFallback<T>(
  apiKey: string | null | undefined,
  preferred: string | null | undefined,
  run: (modelId: string, model: ReturnType<ReturnType<typeof createOpenAI>['chat']>) => Promise<T>,
  needsVision = false,
): Promise<T> {
  const chain = getOpenRouterModelChain(preferred, needsVision)
  const key = apiKey || process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('ไม่มี OpenRouter API Key')
  const client = createOpenAI({
    apiKey: key,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: { 'HTTP-Referer': 'https://smart-spender-ai.app', 'X-Title': 'Smart Spender AI' },
  })
  console.log(`[OpenRouter] fallback chain (${chain.length}): ${chain.join(' → ')}`)
  let lastErr: unknown
  for (let i = 0; i < chain.length; i++) {
    const id = chain[i]
    try {
      console.log(`[OpenRouter] [${i + 1}/${chain.length}] trying ${id}`)
      const result = await run(id, client.chat(id))
      console.log(`[OpenRouter] ✓ ${id} succeeded`)
      return result
    } catch (err) {
      lastErr = err
      const status = (err as { statusCode?: number })?.statusCode
      const msg = (err as { message?: string })?.message
      console.warn(`[OpenRouter] ✗ ${id} failed (status=${status}): ${msg}`)
    }
  }
  console.error(`[OpenRouter] all ${chain.length} models exhausted`)
  throw lastErr
}

export function getAIModel(_provider: AIProvider, apiKey?: string | null, model?: string | null) {
  const key = apiKey || process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('ไม่มี OpenRouter API Key')
  const validIds = OPENROUTER_FREE_VISION_MODELS.map(m => m.id)
  const selectedModel = model && validIds.includes(model) ? model : OPENROUTER_FREE_VISION_MODELS[0].id
  return createOpenAI({
    apiKey: key,
    baseURL: 'https://openrouter.ai/api/v1',
    headers: { 'HTTP-Referer': 'https://smart-spender-ai.app', 'X-Title': 'Smart Spender AI' },
  }).chat(selectedModel)
}
