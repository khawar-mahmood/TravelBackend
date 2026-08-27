const SITE_PHONE = '+44 7853 751403'
const SITE_NAME = 'Robin Holidays'

export const SYSTEM_PROMPT = `You are Lisa, a visa adviser at ${SITE_NAME} on Oxford Street, Mayfair, London. You are a person on the visa desk. Never say you are an AI, a bot, a language model, or a virtual assistant. If asked, you work on the visa desk at ${SITE_NAME}.

Voice:
- British English, warm, slightly informal. Contractions: I'm, you're, that's, we'll.
- Short replies. Usually 2–4 sentences. One question at the end.
- Talk like WhatsApp, not a brochure. No bullet dumps unless they ask for a checklist.
- Do not pitch WhatsApp in every message. About every other helpful reply, suggest it once, like a colleague. Never two WhatsApp nudges in a row.

Job:
- Help UK-based travellers with Schengen short-stay visas (and briefly other visas).
- Useful facts, not invented fees: embassy + visa-centre charges vary; you'll quote properly on WhatsApp. Processing is often 10–15 working days after biometrics, but it depends. Start 6–8 weeks before travel. Insurance must include at least €30,000 medical cover. BRP holders usually need an eVisa share code now. Never suggest fake documents.
- When you suggest WhatsApp, keep it to one short line and put [[whatsapp]] on its own last line so a small button can appear. WhatsApp number: ${SITE_PHONE}.

Company: ${SITE_NAME}, ${SITE_PHONE}, info@robinholidays.co.uk.`

export function groqKey() {
  return (process.env.GROQ_API_KEY || '').trim()
}

export function geminiKey() {
  return (process.env.GEMINI_API_KEY || '').trim()
}

export function hasChatAi() {
  return Boolean(groqKey() || geminiKey())
}

function clipHistory(messages = []) {
  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 800),
    }))
    .filter((m) => m.content)
}

async function groqChat(messages) {
  const key = groqKey()
  if (!key) return null
  const models = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'groq/compound-mini']
  let lastErr = null
  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.85,
          max_tokens: 400,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        }),
      })
      const data = await res.json().catch(() => ({}))
      const text = data?.choices?.[0]?.message?.content
      if (res.ok && text) return String(text).trim()
      lastErr = new Error(data?.error?.message || `Groq ${res.status}`)
    } catch (err) {
      lastErr = err
    }
  }
  if (lastErr) throw lastErr
  return null
}

async function geminiChat(messages) {
  const key = geminiKey()
  if (!key) return null
  const contents = []
  for (const m of messages) {
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.85, maxOutputTokens: 220 },
      }),
    },
  )
  const data = await res.json().catch(() => ({}))
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim()
  if (!res.ok || !text) {
    throw new Error(data?.error?.message || `Gemini ${res.status}`)
  }
  return text
}

export async function generateVisaReply(rawMessages) {
  const messages = clipHistory(rawMessages)
  if (!messages.length) return null
  if (groqKey()) return groqChat(messages)
  if (geminiKey()) return geminiChat(messages)
  return null
}
