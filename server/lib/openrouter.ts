// server/lib/openrouter.ts

const BASE = 'https://openrouter.ai/api/v1'
const SITE_URL = 'https://moonshot.app'
const SITE_NAME = 'Moonshot Pitch Decks'

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not set')
  return key
}

export interface ORMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** Non-streaming text call — returns the assistant message content */
export async function callOpenRouter(params: {
  model: string
  messages: ORMessage[]
  maxTokens?: number
  temperature?: number
  responseFormat?: { type: 'json_object' }
}): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': SITE_URL,
      'X-Title': SITE_NAME,
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      max_tokens: params.maxTokens,
      temperature: params.temperature ?? 0.7,
      response_format: params.responseFormat,
      stream: false,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>
  }
  return data.choices[0].message.content
}

export interface ImageResult {
  imageDataUrl: string | null
  text: string | null
}

/** Image generation call — returns base64 data URL from Gemini */
export async function generateImage(prompt: string): Promise<ImageResult> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': SITE_URL,
      'X-Title': SITE_NAME,
    },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-image-preview',
      messages: [{ role: 'user', content: prompt }],
      modalities: ['image', 'text'],
      stream: false,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter image ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    choices: Array<{
      message: {
        content: string | Array<{ type: string; image_url?: { url: string }; text?: string }>
        images?: Array<{ image_url: { url: string } }>
      }
    }>
  }

  const message = data.choices[0].message
  let imageDataUrl: string | null = null
  let text: string | null = null

  // Content may be an array of parts (image + text) or plain string
  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === 'image_url' && part.image_url) {
        imageDataUrl = part.image_url.url
      } else if (part.type === 'text' && part.text) {
        text = part.text
      }
    }
  } else if (typeof message.content === 'string') {
    text = message.content
  }

  // Alternate field some OpenRouter responses use
  if (!imageDataUrl && message.images?.[0]) {
    imageDataUrl = message.images[0].image_url.url
  }

  return { imageDataUrl, text }
}
