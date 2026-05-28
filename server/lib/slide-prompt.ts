// server/lib/slide-prompt.ts
import type { SlideOutline, BrandConfig, DeckOutline } from '../../shared/types.js'

export function buildSlidePrompt(
  slide: SlideOutline,
  brand: BrandConfig,
  deck: DeckOutline
): string {
  const bullets = slide.keyPoints.map((p) => `• ${p}`).join('\n')

  return `Create a stunning, professional presentation slide as a high-resolution image (1920x1080, 16:9 widescreen).

SLIDE INFORMATION:
- Deck: "${deck.deckTitle}" — ${deck.tagline}
- Slide ${slide.index} of ${deck.totalSlides}: ${slide.title}
- Type: ${slide.type}
- Content:
${bullets}

BRAND DESIGN SYSTEM:
- Company: ${brand.companyName}
- Primary color: ${brand.primaryColor} (headlines, accents, CTAs)
- Secondary color: ${brand.secondaryColor} (highlights, icons)
- Background: ${brand.backgroundColor}
- Text color: ${brand.textColor}
- Font: ${brand.fontFamily}
- Visual style: ${brand.styleKeywords.join(', ')}
- Logo/identity: ${brand.logoDescription}

VISUAL DIRECTION:
${slide.visualDirection}

DESIGN REQUIREMENTS:
- Looks like it belongs in a $10M Series A investor deck
- Clean, bold typography — headline prominent, body text readable
- Strong visual hierarchy: headline → visual → supporting text
- Use white space generously — never crowd the slide
- Background must incorporate brand colors thoughtfully
- Subtle geometric or abstract design elements reinforcing the brand
- Text legible at presentation size — no tiny fonts
- Visually striking — investors will glance for 3 seconds
- Render the slide ONLY — no device mockups, browser chrome, or shadows`
}
