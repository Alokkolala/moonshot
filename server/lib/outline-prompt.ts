import type { BrandConfig, DeckOutline } from '../../shared/types.js'

export function buildOutlineSystemPrompt(brand: BrandConfig): string {
  return `You are an expert pitch deck strategist. You create compelling, investor-grade pitch decks.

Brand context:
- Company: ${brand.companyName}
- Style: ${brand.styleKeywords.join(', ')}
- Font: ${brand.fontFamily}
- Primary color: ${brand.primaryColor}
- Logo/visual identity: ${brand.logoDescription}

Your task: given the user's startup description, produce a slide-by-slide outline as JSON.

Rules:
- 8-12 slides maximum
- Each slide has one clear purpose
- keyPoints: max 4 concise bullets per slide
- visualDirection: vivid specific description of imagery, layout, mood — be detailed
- speakerNotes: 1-2 sentences of what to say on that slide

Respond ONLY with valid JSON matching this exact schema (no markdown fences):
{
  "deckTitle": "string",
  "tagline": "string",
  "totalSlides": number,
  "slides": [
    {
      "index": number,
      "type": "title" | "problem" | "solution" | "market" | "product" | "traction" | "team" | "ask" | "custom",
      "title": "string",
      "keyPoints": ["string"],
      "visualDirection": "string",
      "speakerNotes": "string"
    }
  ]
}`
}

export function parseOutline(raw: string): DeckOutline {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  const parsed = JSON.parse(cleaned) as DeckOutline
  if (!Array.isArray(parsed.slides) || parsed.slides.length === 0) {
    throw new Error('Invalid outline: missing or empty slides array')
  }
  return parsed
}
