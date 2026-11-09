import { prisma } from '@/lib/db/prisma'
import { getValidAccessToken, GmailReconnectRequiredError, RECONNECT_REQUIRED } from './oauth'
import { buildGmailQuery } from './filters'
import { parseTransactionEmail } from './parsers'
import { matchCategory } from '@/lib/categories'
import { addMonths, bangkokMonthBounds, currentBangkokMonth, monthsBetween, type YearMonth } from './time'

interface GmailMessagePart {
  mimeType?: string
  body?: { data?: string }
  parts?: GmailMessagePart[]
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

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
/** Parallel messages.get calls. Gmail allows ~50/s per user (250 quota units/s, 5 per get). */
const CONCURRENCY = 10
/** Stop starting new pages after this long, leaving headroom under the 300s function limit. */
const DEFAULT_BUDGET_MS = 240_000

export interface SyncResult {
  /** Emails scanned in this call. */
  found: number
  /** New candidates created in this call. */
  created: number
  /** Set when the month isn't finished; pass it back to continue where this call stopped. */
  nextPageToken?: string
}

/** fetch with retry on 429 / 5xx (exponential backoff), since parallel gets can hit per-user rate limits. */
async function gmailFetch(url: string | URL, accessToken: string, attempts = 4): Promise<Response> {
  let res: Response | undefined
  for (let i = 0; i < attempts; i++) {
    res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (res.status !== 429 && res.status < 500) return res
    await new Promise(r => setTimeout(r, 500 * 2 ** i))
  }
  return res!
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

type CandidateRow = {
  gmailMessageId: string
  type: string
  amount: number
  description: string
  categoryName: string
  date: Date | null
  confidence: number
  rawSnippet: string
}

async function fetchAndParse(messageId: string, accessToken: string): Promise<CandidateRow | null> {
  try {
    const res = await gmailFetch(`${GMAIL_API}/messages/${messageId}?format=full`, accessToken)
    if (!res.ok) return null // not stored → retried naturally on the next sync
    const msg = (await res.json()) as { payload?: GmailMessagePart; snippet?: string; internalDate?: string }
    const body = extractBody(msg.payload) || msg.snippet || ''
    const text = stripHtml(body).slice(0, 4000)
    if (!text) return null

    const result = parseTransactionEmail(text)
    if (!result) return null

    // Gmail's internalDate is a reliable epoch-ms timestamp; the notification
    // body's own date text is Buddhist-calendar/Thai-month formatted and not worth parsing.
    const internalDateMs = msg.internalDate ? Number(msg.internalDate) : NaN
    return {
      gmailMessageId: messageId,
      type: result.type,
      amount: result.amount,
      description: result.description,
      categoryName: result.categoryName,
      date: Number.isFinite(internalDateMs) ? new Date(internalDateMs) : null,
      confidence: result.confidence,
      rawSnippet: text.slice(0, 1000),
    }
  } catch (err) {
    console.error(`[gmail-sync] message ${messageId} failed:`, err)
    return null
  }
}

/**
 * Scan one Thai calendar month of Gmail for transaction notifications, page by page, until the month
 * is done or the time budget runs out. When it runs out, `nextPageToken` is returned so the caller
 * can continue in a fresh request — this is what lets a full-year backfill fit in short requests.
 * Re-running is safe: messages that already have a candidate are skipped (unique userId+gmailMessageId).
 */
export async function syncGmailForUser(
  userId: string,
  target?: YearMonth,
  opts: { pageToken?: string; budgetMs?: number } = {}
): Promise<SyncResult> {
  const gmailAccount = await prisma.gmailAccount.findUnique({ where: { userId } })
  if (!gmailAccount) throw new Error('Gmail not connected')

  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS)

  try {
    const accessToken = await getValidAccessToken(userId)
    const { start, end } = bangkokMonthBounds(target ?? currentBangkokMonth())
    const query = buildGmailQuery(start, end)
    const cats = await prisma.category.findMany({
      where: { OR: [{ userId }, { userId: null, isDefault: true }] },
      select: { id: true, name: true, nameEn: true, type: true },
    })

    let pageToken = opts.pageToken
    let found = 0
    let created = 0
    do {
      const url = new URL(`${GMAIL_API}/messages`)
      url.searchParams.set('q', query)
      url.searchParams.set('maxResults', '100')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const listRes = await gmailFetch(url, accessToken)
      if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status} ${await listRes.text()}`)
      const page = (await listRes.json()) as { messages?: { id: string }[]; nextPageToken?: string }
      const ids = (page.messages || []).map(m => m.id)
      found += ids.length

      const existing = await prisma.emailTransactionCandidate.findMany({
        where: { userId, gmailMessageId: { in: ids } },
        select: { gmailMessageId: true },
      })
      const known = new Set(existing.map(e => e.gmailMessageId))
      const rows = (await mapPool(ids.filter(id => !known.has(id)), CONCURRENCY, id => fetchAndParse(id, accessToken)))
        .filter((r): r is CandidateRow => r !== null)

      if (rows.length) {
        const r = await prisma.emailTransactionCandidate.createMany({
          data: rows.map(row => ({
            ...row,
            userId,
            matchedCategoryId: matchCategory(row.categoryName, cats.filter(c => c.type === row.type))?.id ?? null,
          })),
          skipDuplicates: true, // a concurrent sync may have inserted the same message
        })
        created += r.count
      }

      pageToken = page.nextPageToken
    } while (pageToken && Date.now() < deadline)

    await prisma.gmailAccount.update({
      where: { userId },
      data: { lastSyncedAt: new Date(), lastError: null },
    })

    return { found, created, nextPageToken: pageToken }
  } catch (err) {
    const message =
      err instanceof GmailReconnectRequiredError ? RECONNECT_REQUIRED : err instanceof Error ? err.message : String(err)
    await prisma.gmailAccount.update({ where: { userId }, data: { lastError: message } })
    throw err
  }
}

/**
 * Sync every month from the last successful sync up to the current month (capped), so emails that
 * arrived while the connection was broken are not skipped. Falls back to the current month only.
 */
export async function syncGmailCatchUp(userId: string, maxMonths = 3): Promise<SyncResult> {
  const account = await prisma.gmailAccount.findUnique({ where: { userId }, select: { lastSyncedAt: true } })
  const now = currentBangkokMonth()
  const from = account?.lastSyncedAt ? currentBangkokMonth(account.lastSyncedAt) : now
  const monthsBack = Math.min(Math.max(monthsBetween(from, now), 0), maxMonths - 1)
  const deadline = Date.now() + DEFAULT_BUDGET_MS

  const total: SyncResult = { found: 0, created: 0 }
  for (let i = monthsBack; i >= 0; i--) {
    let pageToken: string | undefined
    do {
      const r = await syncGmailForUser(userId, addMonths(now, -i), { pageToken, budgetMs: deadline - Date.now() })
      total.found += r.found
      total.created += r.created
      pageToken = r.nextPageToken
    } while (pageToken && Date.now() < deadline)
    if (Date.now() >= deadline) break
  }
  return total
}
