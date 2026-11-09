// Scans effectively all inbox mail for the month (minus categories that never
// carry transaction notifications) and lets the regex parsers in parsers.ts
// do all the real filtering — an email matches a known bank/e-wallet template
// or it's skipped. Avoids maintaining a hardcoded bank-domain/keyword
// allowlist, which kept missing real senders/phrasings as they were discovered.
export function buildGmailQuery(afterDate: Date, beforeDate: Date): string {
  // Epoch seconds, not YYYY/MM/DD: the Gmail API interprets date strings as midnight *PST*,
  // which would shift Thai month boundaries by ~15 hours.
  const after = Math.floor(afterDate.getTime() / 1000)
  const before = Math.floor(beforeDate.getTime() / 1000)
  return `after:${after} before:${before} -category:promotions -category:social -category:forums`
}
