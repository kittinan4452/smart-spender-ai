// Scans effectively all inbox mail for the month (minus categories that never
// carry transaction notifications) and lets the AI classifier
// (isTransaction/confidence in analyzeEmailForTransaction) do all the real
// filtering. Avoids maintaining a hardcoded bank-domain/keyword allowlist,
// which kept missing real senders/phrasings as they were discovered.
function formatGmailDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

export function buildGmailQuery(afterDate: Date, beforeDate: Date): string {
  return `after:${formatGmailDate(afterDate)} before:${formatGmailDate(beforeDate)} -category:promotions -category:social -category:forums`
}
