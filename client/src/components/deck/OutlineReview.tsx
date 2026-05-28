// client/src/components/deck/OutlineReview.tsx
import { useDeckStore } from '@/store/deck-store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

const TYPE_STYLES: Record<string, string> = {
  title:     'bg-violet-500/20 text-violet-300',
  problem:   'bg-red-500/20 text-red-300',
  solution:  'bg-green-500/20 text-green-300',
  market:    'bg-blue-500/20 text-blue-300',
  product:   'bg-amber-500/20 text-amber-300',
  traction:  'bg-emerald-500/20 text-emerald-300',
  team:      'bg-cyan-500/20 text-cyan-300',
  ask:       'bg-pink-500/20 text-pink-300',
  custom:    'bg-white/10 text-white/50',
}

interface Props {
  onGenerate: () => void
}

export function OutlineReview({ onGenerate }: Props) {
  const { outline, brand } = useDeckStore()
  if (!outline) return null

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-white/8 space-y-1">
        <h1 className="text-xl font-bold text-white">{outline.deckTitle}</h1>
        <p className="text-sm text-white/50">{outline.tagline}</p>
        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs text-white/30">{outline.totalSlides} slides</span>
          <span
            className="w-3 h-3 rounded-full border border-white/20"
            style={{ backgroundColor: brand.primaryColor }}
          />
          <span
            className="w-3 h-3 rounded-full border border-white/20"
            style={{ backgroundColor: brand.secondaryColor }}
          />
          <span className="text-xs text-white/30">
            {brand.companyName || 'Your Company'}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1 px-6">
        <div className="py-4 space-y-3">
          {outline.slides.map((slide) => (
            <div
              key={slide.index}
              className="rounded-xl bg-white/4 border border-white/8 p-4 space-y-2 hover:bg-white/6 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-white/30 w-4 shrink-0">
                  {slide.index}
                </span>
                <Badge
                  className={`text-[10px] uppercase tracking-wider px-2 py-0 border-0 ${
                    TYPE_STYLES[slide.type] ?? TYPE_STYLES.custom
                  }`}
                >
                  {slide.type}
                </Badge>
                <h3 className="text-sm font-semibold text-white">{slide.title}</h3>
              </div>
              <ul className="ml-7 space-y-0.5">
                {slide.keyPoints.map((point, i) => (
                  <li key={i} className="text-xs text-white/50 flex gap-2">
                    <span className="text-white/20 shrink-0">•</span>
                    {point}
                  </li>
                ))}
              </ul>
              <p className="ml-7 text-xs italic text-white/25 line-clamp-1">
                {slide.visualDirection}
              </p>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="px-6 py-4 border-t border-white/8 space-y-2">
        <Button
          onClick={onGenerate}
          className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-semibold py-5 text-base"
        >
          Generate All Slides ✨
        </Button>
        <p className="text-center text-xs text-white/20">
          Generates {outline.totalSlides} slides using Nano Banana 2
        </p>
      </div>
    </div>
  )
}
