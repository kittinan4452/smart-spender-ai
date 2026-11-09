import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { matchCategory } from '@/lib/categories'

/** Below this, a candidate is not pre-selected for bulk confirm. */
export const LOW_CONFIDENCE = 0.7
/** A candidate within this window of an existing transaction with the same type + amount is flagged. */
const DUPLICATE_WINDOW_MS = 36 * 60 * 60 * 1000
/** Banks sometimes send two notifications for one transfer; same type + amount within this window. */
const SIBLING_WINDOW_MS = 10 * 60 * 1000

export interface CandidateOverrides {
  amount?: number
  type?: string
  description?: string
  categoryId?: string
}

export interface DuplicateHint {
  kind: 'transaction' | 'candidate'
  description: string
  date: string
}

type Tx = Prisma.TransactionClient
type Cat = { id: string; name: string; nameEn: string | null; type: string }

function sameAmount(a: number, b: number) {
  return Math.abs(a - b) < 0.005
}

/** List pending candidates (optionally for one month) annotated with duplicate / confidence hints. */
export async function listPendingCandidates(userId: string, range?: { start: Date; end: Date }) {
  const where: Prisma.EmailTransactionCandidateWhereInput = { userId, status: 'pending' }
  if (range) {
    // Candidates whose email date couldn't be read fall back to when they were detected,
    // otherwise they'd never show up under any month.
    where.OR = [
      { date: { gte: range.start, lt: range.end } },
      { date: null, createdAt: { gte: range.start, lt: range.end } },
    ]
  }

  const candidates = await prisma.emailTransactionCandidate.findMany({
    where,
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })
  if (candidates.length === 0) return []

  const when = (c: (typeof candidates)[number]) => (c.date ?? c.createdAt).getTime()
  const times = candidates.map(when)
  const existing = await prisma.transaction.findMany({
    where: {
      userId,
      date: {
        gte: new Date(Math.min(...times) - DUPLICATE_WINDOW_MS),
        lte: new Date(Math.max(...times) + DUPLICATE_WINDOW_MS),
      },
    },
    select: { type: true, amount: true, date: true, description: true },
  })

  // Oldest first, so the *later* of two sibling notifications gets flagged.
  const chronological = [...candidates].sort((a, b) => when(a) - when(b) || a.id.localeCompare(b.id))
  const order = new Map(chronological.map((c, i) => [c.id, i]))

  return candidates.map(c => {
    const t = when(c)
    let duplicateOf: DuplicateHint | null = null

    const tx = existing.find(
      e => e.type === c.type && sameAmount(e.amount, c.amount) && Math.abs(e.date.getTime() - t) <= DUPLICATE_WINDOW_MS
    )
    if (tx) {
      duplicateOf = { kind: 'transaction', description: tx.description, date: tx.date.toISOString() }
    } else {
      const sibling = chronological.find(
        o => order.get(o.id)! < order.get(c.id)! && o.type === c.type && sameAmount(o.amount, c.amount) &&
          t - when(o) <= SIBLING_WINDOW_MS
      )
      if (sibling) {
        duplicateOf = { kind: 'candidate', description: sibling.description, date: new Date(when(sibling)).toISOString() }
      }
    }

    return {
      id: c.id,
      type: c.type,
      amount: c.amount,
      description: c.description,
      categoryName: c.categoryName,
      matchedCategoryId: c.matchedCategoryId,
      date: (c.date ?? c.createdAt).toISOString(),
      confidence: c.confidence,
      rawSnippet: c.rawSnippet,
      lowConfidence: c.confidence < LOW_CONFIDENCE,
      duplicateOf,
    }
  })
}

async function userCategories(tx: Tx, userId: string): Promise<Cat[]> {
  return tx.category.findMany({
    where: { OR: [{ userId }, { userId: null, isDefault: true }] },
    select: { id: true, name: true, nameEn: true, type: true },
  })
}

/** Pick a category the user may use and whose type matches; never trust a client-sent id blindly. */
function resolveCategory(cats: Cat[], type: string, preferredIds: (string | null | undefined)[], categoryName: string) {
  for (const id of preferredIds) {
    const c = id ? cats.find(x => x.id === id && x.type === type) : undefined
    if (c) return c.id
  }
  const ofType = cats.filter(c => c.type === type)
  return (matchCategory(categoryName, ofType) || ofType.find(c => c.name === 'อื่นๆ') || ofType[0])?.id ?? null
}

/**
 * Confirm candidates into real transactions. Each candidate is claimed with a conditional update
 * (status pending → confirmed) before its transaction is created, so double-clicks or concurrent
 * requests can never create the same transaction twice.
 */
export async function confirmCandidates(
  userId: string,
  ids: string[],
  overrides: Record<string, CandidateOverrides> = {}
) {
  return prisma.$transaction(async tx => {
    const cats = await userCategories(tx, userId)
    const candidates = await tx.emailTransactionCandidate.findMany({ where: { id: { in: ids }, userId } })
    const confirmed: { candidateId: string; transactionId: string }[] = []

    for (const c of candidates) {
      const o = overrides[c.id] ?? {}
      const type = o.type === 'income' || o.type === 'expense' ? o.type : c.type
      const categoryId = resolveCategory(cats, type, [o.categoryId, c.matchedCategoryId], c.categoryName)
      if (!categoryId) continue

      const claimed = await tx.emailTransactionCandidate.updateMany({
        where: { id: c.id, userId, status: 'pending' },
        data: { status: 'confirmed' },
      })
      if (claimed.count === 0) continue

      const amount = typeof o.amount === 'number' && Number.isFinite(o.amount) && o.amount > 0 ? o.amount : c.amount
      const created = await tx.transaction.create({
        data: {
          userId,
          amount,
          type,
          description: o.description?.trim() || c.description,
          categoryId,
          date: c.date ?? undefined,
          aiGenerated: true,
          rawInput: c.rawSnippet,
        },
        select: { id: true },
      })
      await tx.emailTransactionCandidate.update({ where: { id: c.id }, data: { transactionId: created.id } })
      confirmed.push({ candidateId: c.id, transactionId: created.id })
    }

    return { confirmed, skipped: ids.length - confirmed.length }
  })
}

export async function dismissCandidates(userId: string, ids: string[]) {
  const r = await prisma.emailTransactionCandidate.updateMany({
    where: { id: { in: ids }, userId, status: 'pending' },
    data: { status: 'dismissed' },
  })
  return { dismissed: r.count, skipped: ids.length - r.count }
}

/** Undo a confirm or dismiss: delete the created transactions and put candidates back to pending. */
export async function restoreCandidates(userId: string, ids: string[]) {
  return prisma.$transaction(async tx => {
    const candidates = await tx.emailTransactionCandidate.findMany({
      where: { id: { in: ids }, userId, status: { in: ['confirmed', 'dismissed'] } },
      select: { id: true, transactionId: true },
    })
    const txIds = candidates.map(c => c.transactionId).filter((x): x is string => !!x)

    await tx.emailTransactionCandidate.updateMany({
      where: { id: { in: candidates.map(c => c.id) }, userId },
      data: { status: 'pending', transactionId: null },
    })
    if (txIds.length) await tx.transaction.deleteMany({ where: { id: { in: txIds }, userId } })

    return { restored: candidates.length }
  })
}
