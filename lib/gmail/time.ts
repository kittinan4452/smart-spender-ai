/**
 * Month math in Thai time (UTC+7, no DST). Servers (Vercel) run in UTC, so `new Date(y, m, 1)` would
 * put month boundaries 7 hours off for Thai users.
 */
const BKK_OFFSET_MS = 7 * 60 * 60 * 1000

export interface YearMonth {
  year: number
  /** 1–12 */
  month: number
}

export function currentBangkokMonth(now = new Date()): YearMonth {
  const t = new Date(now.getTime() + BKK_OFFSET_MS)
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1 }
}

/** `offset` months away from `ym` (negative = earlier). */
export function addMonths(ym: YearMonth, offset: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + offset
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export function monthsBetween(from: YearMonth, to: YearMonth): number {
  return (to.year - from.year) * 12 + (to.month - from.month)
}

/** [start, end) of a Thai calendar month as UTC instants. */
export function bangkokMonthBounds({ year, month }: YearMonth): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1) - BKK_OFFSET_MS),
    end: new Date(Date.UTC(year, month, 1) - BKK_OFFSET_MS),
  }
}
