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
- keyPoints: max 4 concise bullets per slide — write them as short, punchy phrases, not sentences
- visualDirection: write this as a DESIGN BRIEF for a slide art director. Be specific about layout concept, typography treatment, and what the dominant visual element is. Examples of good visualDirection values:
    • "Full-bleed dark background. The number '80%' rendered enormous — 400px — top-left in primary color. Three-word label below in muted gray. Single thin horizontal rule as the only decoration."
    • "Typographic triptych: three equal columns, each headed by a one-word verb in bold, supporting copy below in regular weight. Clean grid lines separating columns. No imagery."
    • "Hero layout. Company name in display size, centered. Tagline in light weight two lines below. Abstract 3D sphere in primary color gradient, right-aligned, bleeds off the edge."
    • "Split layout: left 40% is solid primary color with white headline. Right 60% is dark with three stat blocks stacked vertically, each with a large number and small label."
  Never say 'vibrant colors' or 'modern design'. Describe EXACTLY what you see on the slide.
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
