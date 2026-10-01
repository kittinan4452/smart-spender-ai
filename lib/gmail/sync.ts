import { prisma } from '@/lib/db/prisma'
import { getValidAccessToken } from './oauth'
import { buildGmailQuery } from './filters'
import { parseTransactionEmail } from './parsers'
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

        const result = parseTransactionEmail(text)
        if (!result) continue

        const cats = await prisma.category.findMany({
          where: { type: result.type, OR: [{ userId }, { userId: null, isDefault: true }] },
        })
        const matched = matchCategory(result.categoryName, cats)

        // Gmail's internalDate is a reliable epoch-ms timestamp; the notification
        // body's own date text is Buddhist-calendar/Thai-month formatted and not worth parsing.
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
