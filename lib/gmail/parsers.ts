// Deterministic, regex-based extraction of transaction data from bank/e-wallet
// notification emails. Replaces the AI classifier previously used in sync.ts —
// real synced data showed the AI (even with strict prompting) occasionally
// fabricated large income/expense entries from emails that carry no amount at
// all (e.g. a Krungthai NEXT "login successful" notification). A regex that
// requires the literal amount field to be present can't do that: no match, no
// candidate.
//
// Only templates seen in real synced mail are covered. An email from a sender/
// format not covered here simply produces no candidate (logged for visibility)
// rather than falling back to AI — add a new parser below once a real sample
// of that format is available.

export interface ParsedEmailTransaction {
  type: 'income' | 'expense'
  amount: number
  description: string
  categoryName: string
  confidence: number
}

function toAmount(raw: string): number {
  return Number(raw.replace(/,/g, ''))
}

const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/coffee|cafe|กาแฟ|เครื่องดื่ม|restaurant|ร้านอาหาร|อาหาร|food/i, 'อาหาร & เครื่องดื่ม'],
  [/cinema|egv|major|movie|หนัง|บันเทิง/i, 'บันเทิง'],
  [/shopee|lazada|cosmetics|ช้อปปิ้ง|shop/i, 'ช้อปปิ้ง'],
  [/true.*(wallet|money)|dtac|ais|internet|โทรศัพท์|เติมเงิน/i, 'ค่าโทรศัพท์ / อินเทอร์เน็ต'],
]

function guessCategory(hint: string, fallback = 'อื่นๆ'): string {
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(hint)) return cat
  }
  return fallback
}

type Parser = (text: string) => ParsedEmailTransaction | null

// Krungthai NEXT — PromptPay transfer: "...ไปยังบัญชีพร้อมเพย์ : <name> หมายเลขพร้อมเพย์ : ... จำนวนเงิน : X.XX บาท"
const ktbPromptPay: Parser = text => {
  if (!/โอนเงินพร้อมเพย์ผ่าน Krungthai NEXT สำเร็จ/.test(text)) return null
  const recipient = /ไปยังบัญชีพร้อมเพย์\s*:\s*(.+?)\s*หมายเลขพร้อมเพย์/.exec(text)?.[1]
  const amount = /จำนวนเงิน\s*:\s*([\d,]+\.\d{2})\s*บาท/.exec(text)?.[1]
  if (!amount) return null
  return {
    type: 'expense',
    amount: toAmount(amount),
    description: recipient ? `โอนพร้อมเพย์ให้ ${recipient}` : 'โอนเงินพร้อมเพย์',
    categoryName: 'อื่นๆ',
    confidence: 1,
  }
}

// Krungthai NEXT — regular transfer to another bank account: "...ไปยังบัญชี : <name> เลขบัญชี : <bank> ... จำนวนเงิน : X.XX บาท"
const ktbTransfer: Parser = text => {
  if (!/ทำรายการโอนเงินผ่าน Krungthai NEXT สำเร็จ/.test(text)) return null
  const recipient = /ไปยังบัญชี\s*:\s*(.+?)\s*เลขบัญชี/.exec(text)?.[1]
  const amount = /จำนวนเงิน\s*:\s*([\d,]+\.\d{2})\s*บาท/.exec(text)?.[1]
  if (!amount) return null
  return {
    type: 'expense',
    amount: toAmount(amount),
    description: recipient ? `โอนเงินให้ ${recipient}` : 'โอนเงิน',
    categoryName: 'อื่นๆ',
    confidence: 1,
  }
}

// Krungthai NEXT — bill/merchant payment: "...ไปยังผู้ให้บริการ : <merchant> จำนวนเงินที่ชำระ : X.XX บาท"
const ktbBillPay: Parser = text => {
  if (!/จ่ายบิลผ่าน Krungthai NEXT สำเร็จ/.test(text)) return null
  const merchant = /ไปยังผู้ให้บริการ\s*:\s*(.+?)\s*จำนวนเงินที่ชำระ/.exec(text)?.[1]
  const amount = /จำนวนเงินที่ชำระ\s*:\s*([\d,]+\.\d{2})\s*บาท/.exec(text)?.[1]
  if (!amount) return null
  return {
    type: 'expense',
    amount: toAmount(amount),
    description: merchant || 'จ่ายบิล',
    categoryName: guessCategory(merchant || ''),
    confidence: 1,
  }
}

// BAAC (ธ.ก.ส.) outgoing-transfer confirmation, sent with the destination bank's
// name in the body: "โอนเงินจากบัญชีผู้โอน : ... โอนเงินไปยังบัญชีผู้รับโอน : ...
// ชื่อบัญชีผู้รับเงิน : <name> ธนาคาร : <bank> ... จำนวนเงิน (บาท) : X.XX"
// The "ผู้โอน" (sender) account is always the user's own — this template only
// ever represents money leaving the user's account.
const baacTransferOut: Parser = text => {
  if (!/ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร/.test(text)) return null
  if (!/โอนเงินจากบัญชีผู้โอน\s*:/.test(text)) return null
  const recipient = /ชื่อบัญชีผู้รับเงิน\s*:\s*(.+?)\s*ธนาคาร\s*:/.exec(text)?.[1]
  const bank = /ธนาคาร\s*:\s*(.+?)\s*จำนวนเงิน\s*\(บาท\)/.exec(text)?.[1]
  const amount = /จำนวนเงิน\s*\(บาท\)\s*:\s*([\d,]+\.\d{2})/.exec(text)?.[1]
  if (!amount) return null
  const who = [recipient, bank].filter(Boolean).join(' ')
  return {
    type: 'expense',
    amount: toAmount(amount),
    description: who ? `โอนเงินให้ ${who}` : 'โอนเงิน',
    categoryName: 'อื่นๆ',
    confidence: 1,
  }
}

// Kiatnakin Phatra Bank (KKP) — incoming transfer: "...ธนาคารขอแจ้งรายการรับเงินเข้าบัญชีให้ท่านทราบ ... จำนวนเงิน : X.XX THB"
const kkpIncomingTransfer: Parser = text => {
  if (!/ธนาคารขอแจ้งรายการรับเงินเข้าบัญชีให้ท่านทราบ/.test(text)) return null
  const amount = /จำนวนเงิน\s*:\s*([\d,]+\.\d{2})\s*THB/.exec(text)?.[1]
  if (!amount) return null
  return {
    type: 'income',
    amount: toAmount(amount),
    description: 'เงินเข้าบัญชี KKP',
    categoryName: 'รายได้พิเศษ',
    confidence: 1,
  }
}

// Krungthai donation receipt: "บริจาคเพื่อ: <org> ... จำนวนเงิน: X.XX บาท"
const ktbDonation: Parser = text => {
  if (!/ใบรับเงินบริจาค/.test(text)) return null
  const org = /บริจาคเพื่อ\s*:\s*(.+?)\s*จำนวนเงิน\s*:/.exec(text)?.[1]
  const amount = /จำนวนเงิน\s*:\s*([\d,]+\.\d{2})\s*บาท/.exec(text)?.[1]
  if (!amount) return null
  return {
    type: 'expense',
    amount: toAmount(amount),
    description: org ? `บริจาคให้ ${org}` : 'บริจาค',
    categoryName: 'อื่นๆ',
    confidence: 1,
  }
}

// Google Play recurring subscription charge: "...you've been charged ... Total: ฿X.XX"
const googlePlaySubscription: Parser = text => {
  if (!/Google Play/.test(text) || !/charged/.test(text)) return null
  const amount = /Total:\s*฿([\d,]+\.\d{2})/.exec(text)?.[1]
  if (!amount) return null
  const item = /membership \(([^)]+)\)|^(.*?)\s+Auto-renewing/.exec(text)
  return {
    type: 'expense',
    amount: toAmount(amount),
    description: 'สมัครสมาชิก Google Play',
    categoryName: guessCategory(item?.[1] || item?.[2] || '', 'บันเทิง'),
    confidence: 1,
  }
}

const PARSERS: Parser[] = [
  ktbPromptPay,
  ktbTransfer,
  ktbBillPay,
  baacTransferOut,
  kkpIncomingTransfer,
  ktbDonation,
  googlePlaySubscription,
]

export function parseTransactionEmail(text: string): ParsedEmailTransaction | null {
  for (const parser of PARSERS) {
    const result = parser(text)
    if (result) return result
  }
  return null
}
