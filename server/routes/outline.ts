import { Router, Request, Response } from 'express'
import { callOpenRouter, type ORContentPart } from '../lib/openrouter.js'
import { buildOutlineSystemPrompt, parseOutline } from '../lib/outline-prompt.js'
import type { BrandConfig } from '../../shared/types.js'

export const outlineRouter = Router()

outlineRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { userDescription, brand, conversationContext, referenceImages } = req.body as {
      userDescription: string
      brand: BrandConfig
      conversationContext: string
      referenceImages?: string[]   // base64 data URLs
    }

    if (!userDescription?.trim() || userDescription.trim().length < 10) {
      res.status(400).json({ error: 'Description must be at least 10 characters.' })
      return
    }

    const systemPrompt = buildOutlineSystemPrompt(brand)
    const textContent = conversationContext
      ? `Conversation so far:\n${conversationContext}\n\nNow create the slide outline.`
      : userDescription

    // Build multimodal user message if reference images are attached
    const hasImages = referenceImages && referenceImages.length > 0
    const userMessage = hasImages
      ? {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: `${textContent}\n\nI've attached ${referenceImages.length} reference image(s) for design inspiration. Use them to inform the visual direction of each slide.` },
            ...referenceImages.map((url): ORContentPart => ({
              type: 'image_url',
              image_url: { url },
            })),
          ],
        }
      : { role: 'user' as const, content: textContent }

    const raw = await callOpenRouter({
      model: 'anthropic/claude-sonnet-4-5',
      messages: [
        { role: 'system', content: systemPrompt },
        userMessage,
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
