// server/routes/slide.ts
import { Router, Request, Response } from 'express'
import { generateImage } from '../lib/openrouter.js'
import { buildSlidePrompt } from '../lib/slide-prompt.js'
import type { SlideOutline, BrandConfig, DeckOutline } from '../../shared/types.js'

export const slideRouter = Router()

slideRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { slide, brand, deck } = req.body as {
      slide: SlideOutline
      brand: BrandConfig
      deck: DeckOutline
    }

    if (!slide || !brand || !deck) {
      res.status(400).json({ error: 'Missing required fields: slide, brand, deck' })
      return
    }

    const prompt = buildSlidePrompt(slide, brand, deck)
    const result = await generateImage(prompt)

    if (!result.imageDataUrl) {
      res.status(502).json({
        error: `Model returned no image. Text: ${result.text ?? 'none'}`,
      })
      return
    }

    res.json({ imageDataUrl: result.imageDataUrl, slideIndex: slide.index })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/slide]', message)
    res.status(500).json({ error: message })
  }
})
