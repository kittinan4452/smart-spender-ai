import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { AIProvider, runWithOpenRouterFallback, OPENROUTER_DEFAULT_TEXT_MODEL, OPENROUTER_DEFAULT_VISION_MODEL } from './providers'

const TransactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number(),
  description: z.string(),
  categoryName: z.string(),
  date: z.string().optional(),
  note: z.string().optional(),
  confidence: z.number().min(0).max(1),
})

export type AnalyzedTransaction = z.infer<typeof TransactionSchema>

const SYSTEM_PROMPT = {
  th: `คุณเป็นผู้ช่วยวิเคราะห์ข้อมูลทางการเงิน วิเคราะห์ข้อความหรือภาพสลิป/ใบเสร็จ แล้วดึงข้อมูลรายการเงิน
       หมวดหมู่ที่ใช้ได้: อาหาร & เครื่องดื่ม, เดินทาง, ที่พัก, สุขภาพ, บันเทิง, ช้อปปิ้ง, การศึกษา, ค่าสาธารณูปโภค, เงินเดือน, รายได้พิเศษ, ลงทุน, อื่นๆ
       ตอบเป็น JSON เท่านั้น`,
  en: `You are a financial transaction analyzer. Extract transaction data from text or receipt/slip images.
       Available categories: Food & Drinks, Transport, Housing, Health, Entertainment, Shopping, Education, Utilities, Salary, Extra Income, Investment, Others
       Reply in JSON only`,
}

export async function analyzeTransaction(
  input: string,
  _provider: AIProvider = 'openrouter',
  apiKey?: string | null,
  language: 'th' | 'en' = 'th',
): Promise<AnalyzedTransaction> {
  // Text analysis → always DeepSeek
  const { object } = await runWithOpenRouterFallback(apiKey, OPENROUTER_DEFAULT_TEXT_MODEL, (_, model) =>
    generateObject({
      model,
      schema: TransactionSchema,
      system: SYSTEM_PROMPT[language],
      prompt: input,
    })
  )
  return object
}

const EmailTransactionSchema = TransactionSchema.extend({
  isTransaction: z
    .boolean()
    .describe('true เฉพาะถ้าอีเมลนี้แจ้งการทำธุรกรรมเงินที่เกิดขึ้นจริง (โอน/รับ/จ่าย/หักบัญชี) ไม่ใช่โปรโมชั่น ข่าวสาร หรือ OTP'),
})

export type AnalyzedEmailTransaction = z.infer<typeof EmailTransactionSchema>

const EMAIL_SYSTEM_PROMPT = {
  th: `คุณเป็นผู้ช่วยวิเคราะห์อีเมลแจ้งเตือนธุรกรรมทางการเงินจากธนาคารหรือ e-wallet
       เนื้อหาที่ให้มาคืออีเมลจริงที่ดึงมาทั้งฉบับ ห้ามสร้าง/เดา/แต่งข้อมูลใดๆ ขึ้นเองเด็ดขาด ต้องดึงเฉพาะตัวเลขและข้อความที่ปรากฏอยู่ในเนื้อหาจริงเท่านั้น
       ตั้ง isTransaction เป็น true ได้ก็ต่อเมื่อเนื้อหามีหลักฐานที่เป็นรูปธรรมของธุรกรรมที่เกิดขึ้นจริงครบทุกข้อ: (1) มีจำนวนเงินที่ระบุชัดเจนเป็นตัวเลข (2) มีชื่อธนาคารหรือผู้ให้บริการการเงิน และ (3) มีหมายเลขอ้างอิง/เลขบัญชี/reference number ของธุรกรรมนั้น
       ถ้าขาดข้อใดข้อหนึ่ง หรือเป็นอีเมลประเภทอื่น (โปรโมชั่น, ข่าวสาร, OTP, การแจ้งเตือนเข้าสู่ระบบ, จดหมายข่าว, ใบแจ้งยอดสรุปทั่วไป, หรือเนื้อหาที่ไม่เกี่ยวกับเงินเลย) ให้ตั้ง isTransaction เป็น false และใส่ amount เป็น 0
       ตอบเป็น JSON เท่านั้น`,
  en: `You are a financial notification email analyzer for bank/e-wallet transaction alerts.
       The content given is a real, complete email. Never invent, guess, or fabricate any data — only extract numbers and text that literally appear in the content.
       Only set isTransaction to true if the email contains ALL of these concrete markers: (1) an explicit numeric amount, (2) a named bank or payment provider, and (3) a transaction reference number or account number.
       If any of these are missing, or the email is a different type (promo, newsletter, OTP, login notification, general statement summary, or unrelated to money at all), set isTransaction to false and amount to 0.
       Reply in JSON only`,
}

export async function analyzeEmailForTransaction(
  emailText: string,
  apiKey?: string | null,
  language: 'th' | 'en' = 'th',
): Promise<AnalyzedEmailTransaction> {
  const { object } = await runWithOpenRouterFallback(apiKey, OPENROUTER_DEFAULT_TEXT_MODEL, (_, model) =>
    generateObject({
      model,
      schema: EmailTransactionSchema,
      system: EMAIL_SYSTEM_PROMPT[language],
      prompt: emailText,
    })
  )
  return object
}

export async function analyzeTransactionImage(
  imageBase64: string,
  mimeType: string,
  text: string,
  _provider: AIProvider = 'openrouter',
  apiKey?: string | null,
  language: 'th' | 'en' = 'th',
  visionModel?: string | null,
): Promise<AnalyzedTransaction> {
  // Step 1: vision model reads image → extract text (user-selectable, falls back across vision models)
  const visionPreferred = visionModel || OPENROUTER_DEFAULT_VISION_MODEL
  console.log(`[AI Pipeline] Step 1: vision (preferred=${visionPreferred}) reading image...`)
  const { text: extractedText } = await runWithOpenRouterFallback(
    apiKey,
    visionPreferred,
    (_, model) => generateText({
      model,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: `data:${mimeType};base64,${imageBase64}` },
          {
            type: 'text',
            text: `อ่านข้อมูลทั้งหมดจากภาพสลิป/ใบเสร็จนี้ให้ครบถ้วน ได้แก่ รายการสินค้า ราคา วันที่ ยอดรวม ชื่อร้าน${text ? ` (${text})` : ''}`,
          },
        ],
      }],
    }),
    true,
  )
  console.log(`[AI Pipeline] Step 1 done, extracted: ${extractedText.slice(0, 100)}...`)

  // Step 2: DeepSeek analyzes extracted text → structured transaction (always)
  console.log(`[AI Pipeline] Step 2: ${OPENROUTER_DEFAULT_TEXT_MODEL} analyzing extracted text...`)
  const { object } = await runWithOpenRouterFallback(apiKey, OPENROUTER_DEFAULT_TEXT_MODEL, (_, model) =>
    generateObject({
      model,
      schema: TransactionSchema,
      system: SYSTEM_PROMPT[language],
      prompt: extractedText,
    })
  )
  console.log(`[AI Pipeline] Step 2 done: ${object.description} ${object.amount}`)
  return object
}
