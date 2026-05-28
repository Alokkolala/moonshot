// server/lib/slide-prompt.ts
import type { SlideOutline, BrandConfig, DeckOutline } from '../../shared/types.js'

export function buildSlidePrompt(
  slide: SlideOutline,
  brand: BrandConfig,
  deck: DeckOutline
): string {
  const content = slide.keyPoints.join('\n')
  const isTitle = slide.type === 'title'

  return `Create a single presentation slide as a high-resolution image. Render ONLY the slide — no browser chrome, device frame, shadow, or border outside the slide.

Slide dimensions: 1920×1080px, 16:9 aspect ratio.

---

DESIGN BRIEF
${slide.visualDirection}

---

CONTENT TO PLACE ON THIS SLIDE
Deck: ${deck.deckTitle} — ${deck.tagline}
Slide ${slide.index} of ${deck.totalSlides}
Headline: ${slide.title}
${content}

---

BRAND PALETTE & TYPOGRAPHY
Background color: ${brand.backgroundColor}
Primary accent: ${brand.primaryColor}
Secondary accent: ${brand.secondaryColor}
Text: ${brand.textColor}
Typeface: ${brand.fontFamily}
Company: ${brand.companyName}${brand.logoDescription ? `\nLogo: ${brand.logoDescription}` : ''}

---

DESIGN PRINCIPLES
- Typography IS the design. Let the text breathe — massive headline, deliberate weight contrast between title and body.
- One dominant visual idea per slide. Don't fill every zone.${isTitle ? '\n- Title slide: company name large and centered, tagline small below. One strong graphic element (abstract shape, gradient, or geometric mark) in the background.' : ''}
- Generous white space. Padding of at least 10% on all edges.
- Hierarchy: one thing the eye hits first, everything else supports it.
- Color: background carries the brand atmosphere; accent used sparingly on ONE key element only.
- No clipart, no stock photo feel, no decorative borders. Think Stripe, Linear, or Vercel's design language.
- Every word on screen must earn its place. If a keyPoint is short, render it large.`
}
