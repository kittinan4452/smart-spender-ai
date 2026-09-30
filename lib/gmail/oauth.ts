import crypto from 'crypto'
import { prisma } from '@/lib/db/prisma'

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

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
  if (!res.ok) throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.gmailAccount.findUnique({ where: { userId } })
  if (!account) throw new Error('Gmail not connected')
  if (account.expiresAt.getTime() > Date.now() + 60_000) return account.accessToken

  const refreshed = await refreshAccessToken(account.refreshToken)
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000)
  await prisma.gmailAccount.update({
    where: { userId },
    data: { accessToken: refreshed.access_token, expiresAt },
  })
  return refreshed.access_token
}
