import { prisma } from '@/lib/db/prisma'
import { getValidAccessToken, GmailReconnectRequiredError, RECONNECT_REQUIRED } from './oauth'
import { buildGmailQuery } from './filters'
import { parseTransactionEmail } from './parsers'
import { matchCategory } from '@/lib/categories'
import {
  addMonths,
  bangkokMonthBounds,
  currentBangkokMonth,
  currentMonthWithLookback,
  monthsBetween,
  type YearMonth,
} from './time'

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
/** Parallel messages.get calls; actual throughput is capped by the quota pacer below. */
const CONCURRENCY = 10
/** Stop starting new pages after this long, leaving headroom under the 300s function limit. */
const DEFAULT_BUDGET_MS = 240_000

/**
 * Gmail's per-user quota is 6,000 query-cost units per minute (messages.list and messages.get cost 5
 * each). Unpaced, 10 parallel gets burn through that in well under a minute of a backfill, and Google
 * answers 403 rateLimitExceeded. Pace at ~4,800 units/min (+ a small burst) so a single sync never
 * trips it and a concurrent cron/catch-up still has headroom.
 */
const QUOTA_UNITS_PER_SEC = 80
const QUOTA_BURST_UNITS = 400
const UNITS_PER_CALL = 5
/** How long the client should wait before resuming when Google still rate-limits us. */
const RATE_LIMIT_COOLDOWN_MS = 30_000
/** Longest Retry-After we'll sleep through inside a request before handing the wait back to the caller. */
const MAX_INLINE_WAIT_MS = 10_000

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Token bucket per user (module-level, so it spans requests on the same instance). */
const quotaBuckets = new Map<string, { tokens: number; at: number }>()

async function takeQuota(key: string, units = UNITS_PER_CALL): Promise<void> {
  for (;;) {
    const now = Date.now()
    const b = quotaBuckets.get(key) ?? { tokens: QUOTA_BURST_UNITS, at: now }
    b.tokens = Math.min(QUOTA_BURST_UNITS, b.tokens + ((now - b.at) / 1000) * QUOTA_UNITS_PER_SEC)
    b.at = now
    quotaBuckets.set(key, b)
    if (b.tokens >= units) {
      b.tokens -= units
      return
    }
    await sleep(Math.ceil(((units - b.tokens) / QUOTA_UNITS_PER_SEC) * 1000))
  }
}

/** After Google rate-limits us, drain the bucket so every in-flight worker backs off, not just the one that got hit. */
function penalizeQuota(key: string, ms: number) {
  quotaBuckets.set(key, { tokens: -(ms / 1000) * QUOTA_UNITS_PER_SEC, at: Date.now() })
}

export class GmailRateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super('Gmail rate limit exceeded')
    this.name = 'GmailRateLimitError'
  }
}

export interface SyncResult {
  /** Emails scanned in this call. */
  found: number
  /** New candidates created in this call. */
  created: number
  /** Set when the month isn't finished; pass it back to continue where this call stopped. */
  nextPageToken?: string
  /**
   * Set when Gmail rate-limited the scan: wait this long, then call again with `nextPageToken`
   * (which may be undefined if the very first page was cut short — that just restarts the month,
   * and already-scanned messages are skipped).
   */
  retryAfterMs?: number
}

const RATE_LIMIT_RE = /rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED/

function parseRetryAfter(res: Response): number | undefined {
  const h = res.headers.get('retry-after')
  if (!h) return undefined
  const secs = Number(h)
  if (Number.isFinite(secs)) return secs * 1000
  const at = Date.parse(h)
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined
}

/**
 * Quota-paced fetch with retry. 5xx and rate limits (429, or 403 with a rateLimitExceeded reason —
 * Gmail uses 403 for the per-user quota) back off and retry; a rate limit that survives the retries
 * throws GmailRateLimitError so the caller can stop cleanly and resume later.
 */
async function gmailFetch(url: string | URL, accessToken: string, quotaKey: string, attempts = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    await takeQuota(quotaKey)
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    const rateLimited =
      res.status === 429 || (res.status === 403 && RATE_LIMIT_RE.test(await res.clone().text()))
    if (!rateLimited && res.status < 500) return res

    const retryAfter = parseRetryAfter(res)
    if (rateLimited) penalizeQuota(quotaKey, Math.min(retryAfter ?? 5_000, MAX_INLINE_WAIT_MS))
    if (i === attempts - 1 || (retryAfter !== undefined && retryAfter > MAX_INLINE_WAIT_MS)) {
      if (rateLimited) throw new GmailRateLimitError(Math.max(retryAfter ?? 0, RATE_LIMIT_COOLDOWN_MS))
      return res
    }
    await sleep(retryAfter ?? 1000 * 2 ** i + Math.random() * 500)
  }
}

/** Run `fn` over `items` with at most `limit` in flight. Results keep the order of `items`. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

async function fetchAndParse(messageId: string, accessToken: string, quotaKey: string): Promise<CandidateRow | null> {
  try {
    const res = await gmailFetch(`${GMAIL_API}/messages/${messageId}?format=full`, accessToken, quotaKey)
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
    if (err instanceof GmailRateLimitError) throw err
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
  return syncGmailRange(userId, bangkokMonthBounds(target ?? currentBangkokMonth()), opts)
}

/**
 * What the daily cron scans: the current month, reaching at least this far back. Without the lookback the
 * run on the 1st only sees the new month, so mail that arrived after the last run of the previous month
 * (the cron fires ~06:00 Thai time) would never be scanned. Two days also covers one failed or late run.
 */
const DAILY_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000

/**
 * The daily cron's sync. Takes no page token: the window moves with the clock, so a token from one run
 * wouldn't match the next run's query — anything unfinished is simply re-scanned by the next run.
 */
export async function syncGmailDaily(userId: string, opts: { budgetMs?: number } = {}): Promise<SyncResult> {
  return syncGmailRange(userId, currentMonthWithLookback(new Date(), DAILY_LOOKBACK_MS), { budgetMs: opts.budgetMs })
}

/** Scan [start, end) page by page — the shared engine behind the month, catch-up and daily syncs. */
async function syncGmailRange(
  userId: string,
  { start, end }: { start: Date; end: Date },
  opts: { pageToken?: string; budgetMs?: number } = {}
): Promise<SyncResult> {
  const gmailAccount = await prisma.gmailAccount.findUnique({ where: { userId } })
  if (!gmailAccount) throw new Error('Gmail not connected')

  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS)

  try {
    const accessToken = await getValidAccessToken(userId)
    const query = buildGmailQuery(start, end)
    const cats = await prisma.category.findMany({
      where: { OR: [{ userId }, { userId: null, isDefault: true }] },
      select: { id: true, name: true, nameEn: true, type: true },
    })

    let pageToken = opts.pageToken
    let found = 0
    let created = 0
    let retryAfterMs: number | undefined
    do {
      const url = new URL(`${GMAIL_API}/messages`)
      url.searchParams.set('q', query)
      url.searchParams.set('maxResults', '100')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      let listRes: Response
      try {
        listRes = await gmailFetch(url, accessToken, userId)
      } catch (err) {
        if (!(err instanceof GmailRateLimitError)) throw err
        retryAfterMs = err.retryAfterMs
        break
      }
      if (!listRes.ok) throw new Error(`Gmail list failed: ${listRes.status} ${await listRes.text()}`)
      const page = (await listRes.json()) as { messages?: { id: string }[]; nextPageToken?: string }
      const ids = (page.messages || []).map(m => m.id)

      const existing = await prisma.emailTransactionCandidate.findMany({
        where: { userId, gmailMessageId: { in: ids } },
        select: { gmailMessageId: true },
      })
      const known = new Set(existing.map(e => e.gmailMessageId))
      // Once one get is rate-limited, the remaining workers stop issuing requests for this page.
      const stop: { err?: GmailRateLimitError } = {}
      const rows = (
        await mapPool(ids.filter(id => !known.has(id)), CONCURRENCY, async id => {
          if (stop.err) return null
          try {
            return await fetchAndParse(id, accessToken, userId)
          } catch (err) {
            if (!(err instanceof GmailRateLimitError)) throw err
            stop.err ??= err
            return null
          }
        })
      ).filter((r): r is CandidateRow => r !== null)

      // Save what this page did parse even if it was cut short — the re-scan skips those messages.
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

      if (stop.err) {
        // Leave pageToken pointing at this page so the caller re-scans it after the cooldown.
        retryAfterMs = stop.err.retryAfterMs
        break
      }
      found += ids.length
      pageToken = page.nextPageToken
    } while (pageToken && Date.now() < deadline)

    // A rate-limited run isn't a completed sync; don't advance lastSyncedAt (catch-up relies on it).
    if (!retryAfterMs) {
      await prisma.gmailAccount.update({
        where: { userId },
        data: { lastSyncedAt: new Date(), lastError: null },
      })
    }

    return { found, created, nextPageToken: pageToken, retryAfterMs }
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
    for (;;) {
      const r = await syncGmailForUser(userId, addMonths(now, -i), { pageToken, budgetMs: deadline - Date.now() })
      total.found += r.found
      total.created += r.created
      pageToken = r.nextPageToken
      if (r.retryAfterMs) {
        // Not enough time left to sit out the cooldown — report it so the caller knows the sync is partial.
        if (Date.now() + r.retryAfterMs >= deadline) return { ...total, retryAfterMs: r.retryAfterMs }
        await sleep(r.retryAfterMs)
        continue
      }
      if (!pageToken || Date.now() >= deadline) break
    }
    if (Date.now() >= deadline) break
  }
  return total
}
