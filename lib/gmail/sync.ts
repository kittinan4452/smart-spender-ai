import { prisma } from '@/lib/db/prisma'
import { getValidAccessToken } from './oauth'
import { buildGmailQuery } from './filters'
import { analyzeEmailForTransaction } from '@/lib/ai/analyze'
import { matchCategory } from '@/lib/categories'

interface GmailMessagePart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailMessagePart[]
}

function monthBounds(target?: { month: number; year: number }): { start: Date; end: Date } {
  const now = new Date()
  const year = target?.year ?? now.getFullYear()
  const month = target ? target.month - 1 : now.getMonth()
  return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

// Deterministic anti-hallucination check: the AI's self-reported confidence isn't
// trustworthy on its own (small/free models can confidently fabricate a plausible
// transaction from unrelated content, e.g. newsletters). Require the claimed amount
// to literally appear in the source text before trusting the extraction at all.
function amountAppearsInText(amount: number, text: string): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false
  const variants = new Set<string>([
    String(Math.round(amount)),
    amount.toFixed(2),
    Math.round(amount).toLocaleString('en-US'),
    amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ])
  return [...variants].some(v => text.includes(v))
}

// A real bank/e-wallet transaction email always carries a reference/account marker or
// a recognizable bank/payment-provider name; a newsletter or job listing that merely
// mentions a number (e.g. a salary range in a job ad) never does. Requiring one of
// these alongside the amount closes the gap the amount-only check above misses.
const TRANSACTION_CONTEXT_MARKERS = [
  'หมายเลขอ้างอิง', 'เลขที่อ้างอิง', 'เลขที่บัญชี', 'เลขบัญชี', 'บัญชีผู้โอน', 'บัญชีผู้รับโอน',
  'reference no', 'bank reference', 'account no', 'a/c no',
  'ธนาคาร', 'กรุงไทย', 'krungthai', 'กสิกร', 'kasikorn', 'ไทยพาณิชย์', ' scb ', 'scb.',
  'กรุงเทพ', 'bangkok bank', 'กรุงศรี', 'krungsri', ' ktb', 'ธ.ก.ส', 'baac',
  'truemoney', 'ทรูมันนี่', 'พร้อมเพย์', 'promptpay', 'shopeepay', 'line bk', 'rabbit line pay',
]

function hasTransactionContext(text: string): boolean {
  const lower = text.toLowerCase()
  return TRANSACTION_CONTEXT_MARKERS.some(m => lower.includes(m.toLowerCase()))
}

function extractBody(payload: GmailMessagePart | undefined): string {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64Url(payload.body.data)
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain')
    if (plain?.body?.data) return decodeBase64Url(plain.body.data)
    const html = payload.parts.find(p => p.mimeType === 'text/html')
    if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data))
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }
  return ''
}

export async function syncGmailForUser(
  userId: string,
  target?: { month: number; year: number }
): Promise<{ found: number; created: number }> {
  const gmailAccount = await prisma.gmailAccount.findUnique({ where: { userId } })
  if (!gmailAccount) throw new Error('Gmail not connected')

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { language: true, aiApiKey: true } })
  if (!user) throw new Error('User not found')

  try {
    const accessToken = await getValidAccessToken(userId)
    const { start, end } = monthBounds(target)
    const query = buildGmailQuery(start, end)

    const messages: { id: string }[] = []
    let pageToken: string | undefined
    const MAX_MESSAGES = 500
    do {
      const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
      url.searchParams.set('q', query)
      url.searchParams.set('maxResults', '100')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const listRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status} ${await listRes.text()}`)
      const page = (await listRes.json()) as { messages?: { id: string }[]; nextPageToken?: string }
      messages.push(...(page.messages || []))
      pageToken = page.nextPageToken
    } while (pageToken && messages.length < MAX_MESSAGES)

    let created = 0
    for (const { id: messageId } of messages) {
      try {
        const exists = await prisma.emailTransactionCandidate.findUnique({
          where: { userId_gmailMessageId: { userId, gmailMessageId: messageId } },
        })
        if (exists) continue

        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (!msgRes.ok) continue
        const msg = (await msgRes.json()) as { payload?: GmailMessagePart; snippet?: string; internalDate?: string }
        const body = extractBody(msg.payload) || msg.snippet || ''
        const text = stripHtml(body).slice(0, 4000)
        if (!text) continue

        const result = await analyzeEmailForTransaction(text, user.aiApiKey, (user.language as 'th' | 'en') || 'th')
        if (!result.isTransaction || result.confidence < 0.5) continue
        if (!amountAppearsInText(result.amount, text)) {
          console.warn(`[gmail-sync] message ${messageId}: AI-claimed amount ${result.amount} not found in source text, discarding as likely hallucination`)
          continue
        }
        if (!hasTransactionContext(text)) {
          console.warn(`[gmail-sync] message ${messageId}: no bank/reference marker found in source text, discarding as likely hallucination`)
          continue
        }

        const cats = await prisma.category.findMany({
          where: { type: result.type, OR: [{ userId }, { userId: null, isDefault: true }] },
        })
        const matched = matchCategory(result.categoryName, cats)

        // Prefer Gmail's own internalDate (a reliable epoch-ms timestamp) over the AI's
        // free-text date string, which can come back in Thai Buddhist-calendar / DD-MM-YYYY
        // formats that `new Date()` can't parse and that Prisma then rejects outright.
        const internalDateMs = msg.internalDate ? Number(msg.internalDate) : NaN
        const date = Number.isFinite(internalDateMs) ? new Date(internalDateMs) : null

        await prisma.emailTransactionCandidate.create({
          data: {
            userId,
            gmailMessageId: messageId,
            type: result.type,
            amount: result.amount,
            description: result.description,
            categoryName: result.categoryName,
            matchedCategoryId: matched?.id,
            date,
            confidence: result.confidence,
            rawSnippet: text.slice(0, 1000),
          },
        })
        created++
      } catch (err) {
        console.error(`[gmail-sync] message ${messageId} failed:`, err)
      }
    }

    await prisma.gmailAccount.update({
      where: { userId },
      data: { lastSyncedAt: new Date(), lastError: null },
    })

    return { found: messages.length, created }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.gmailAccount.update({ where: { userId }, data: { lastError: message } })
    throw err
  }
}
