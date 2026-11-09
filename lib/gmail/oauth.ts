import crypto from 'crypto'
import { prisma } from '@/lib/db/prisma'

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/** Stored in GmailAccount.lastError when the refresh token is dead and only a new consent can fix it. */
export const RECONNECT_REQUIRED = 'RECONNECT_REQUIRED'

/**
 * Thrown when Google rejects the refresh token (`invalid_grant`): it expired (7-day limit while the
 * OAuth consent screen is in "Testing"), was revoked by the user, or was invalidated by a password change.
 */
export class GmailReconnectRequiredError extends Error {
  constructor(detail?: string) {
    super(detail ? `${RECONNECT_REQUIRED}: ${detail}` : RECONNECT_REQUIRED)
    this.name = 'GmailReconnectRequiredError'
  }
}

function sign(payload: string) {
  return crypto.createHmac('sha256', process.env.NEXTAUTH_SECRET!).update(payload).digest('hex')
}

export function createState(userId: string) {
  const payload = `${userId}.${Date.now()}`
  return `${payload}.${sign(payload)}`
}

export function verifyState(state: string, maxAgeMs = 10 * 60 * 1000): string | null {
  const parts = state.split('.')
  if (parts.length !== 3) return null
  const [userId, ts, sig] = parts
  const payload = `${userId}.${ts}`
  if (sign(payload) !== sig) return null
  if (Date.now() - Number(ts) > maxAgeMs) return null
  return userId
}

export function buildConsentUrl(redirectUri: string, userId: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: createState(userId),
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; scope: string }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    if (res.status === 400 && text.includes('invalid_grant')) throw new GmailReconnectRequiredError(text)
    throw new Error(`Google token refresh failed: ${res.status} ${text}`)
  }
  return res.json()
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.gmailAccount.findUnique({ where: { userId } })
  if (!account) throw new Error('Gmail not connected')
  // Don't hammer Google with a refresh token we already know is dead; wait for the user to reconnect.
  if (account.lastError === RECONNECT_REQUIRED) throw new GmailReconnectRequiredError()
  if (account.expiresAt.getTime() > Date.now() + 60_000) return account.accessToken

  const refreshed = await refreshAccessToken(account.refreshToken)
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
  await prisma.gmailAccount.update({
    where: { userId },
    data: { accessToken: refreshed.access_token, expiresAt },
  })
  return refreshed.access_token
}

export const RETURN_TO_COOKIE = 'gmail_return_to'

/** Only allow same-site, non-API relative paths to prevent open redirects. */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  if (value.startsWith('/api/')) return null
  return value
}
