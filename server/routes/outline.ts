import { Router, Request, Response } from 'express'
import { callOpenRouter } from '../lib/openrouter.js'
import { buildOutlineSystemPrompt, parseOutline } from '../lib/outline-prompt.js'
import type { BrandConfig } from '../../shared/types.js'

export const outlineRouter = Router()

outlineRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { userDescription, brand, conversationContext } = req.body as {
      userDescription: string
      brand: BrandConfig
      conversationContext: string
    }

    if (!userDescription?.trim() || userDescription.trim().length < 10) {
      res.status(400).json({ error: 'Description must be at least 10 characters.' })
      return
    }

    const systemPrompt = buildOutlineSystemPrompt(brand)
    const userContent = conversationContext
      ? `Conversation so far:\n${conversationContext}\n\nNow create the slide outline.`
      : userDescription

    const raw = await callOpenRouter({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      maxTokens: 4096,
      temperature: 0.7,
      responseFormat: { type: 'json_object' },
    })

    const outline = parseOutline(raw)
    res.json({ outline })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/outline]', message)
    res.status(500).json({ error: message })
  }
})
