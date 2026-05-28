import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { AIProvider, runWithOpenRouterFallback, createOpenRouterClient, OPENROUTER_DEFAULT_TEXT_MODEL, OPENROUTER_DEFAULT_VISION_MODEL } from './providers'

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
  aiModel?: string | null
): Promise<AnalyzedTransaction> {
  // Text analysis → DeepSeek preferred (user can override via aiModel)
  const preferred = aiModel || OPENROUTER_DEFAULT_TEXT_MODEL
  const { object } = await runWithOpenRouterFallback(apiKey, preferred, (_, model) =>
    generateObject({
      model,
      schema: TransactionSchema,
      system: SYSTEM_PROMPT[language],
      prompt: input,
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
): Promise<AnalyzedTransaction> {
  // Step 1: Gemini reads the image → extract text
  const client = createOpenRouterClient(apiKey)
  console.log(`[AI Pipeline] Step 1: ${OPENROUTER_DEFAULT_VISION_MODEL} reading image...`)
  const { text: extractedText } = await generateText({
    model: client.chat(OPENROUTER_DEFAULT_VISION_MODEL),
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
  })
  console.log(`[AI Pipeline] Step 1 done, extracted: ${extractedText.slice(0, 100)}...`)

  // Step 2: DeepSeek analyzes extracted text → structured transaction
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
