// client/src/components/deck/DeckPreview.tsx
import { useState } from 'react'
import { useDeckStore } from '@/store/deck-store'
import { OutlineReview } from '@/components/deck/OutlineReview'
import { SlideCard } from '@/components/deck/SlideCard'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'

export function DeckPreview() {
  const { phase, outline, slides, brand, setPhase, setSlideStatus } = useDeckStore()
  const [activeSlide, setActiveSlide] = useState<number | null>(null)

  const doneCount = slides.filter((s) => s.status === 'done').length
  const totalCount = slides.length
  const progressPct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0

  async function generateAllSlides() {
    if (!outline) return
    setPhase('generating')

    for (const slide of outline.slides) {
      setSlideStatus(slide.index, 'generating')
      setActiveSlide(slide.index)

      try {
        const res = await fetch('/api/slide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slide, brand, deck: outline }),
        })
        const data = await res.json() as { imageDataUrl?: string; error?: string }

        if (!res.ok || !data.imageDataUrl) {
          setSlideStatus(slide.index, 'error', undefined, data.error ?? 'No image returned')
        } else {
          setSlideStatus(slide.index, 'done', data.imageDataUrl)
        }
      } catch (err) {
        setSlideStatus(
          slide.index,
          'error',
          undefined,
          err instanceof Error ? err.message : 'Network error'
        )
      }
    }

    setActiveSlide(null)
    setPhase('done')
  }

  function downloadSlide(index: number) {
    const slide = slides.find((s) => s.index === index)
    if (!slide?.imageDataUrl) return
    const a = document.createElement('a')
    a.href = slide.imageDataUrl
    a.download = `slide-${index}.png`
    a.click()
  }

  if (phase === 'chat') {
    return (
      <div className="flex items-center justify-center h-full bg-[#080810]">
        <div className="text-center space-y-3 px-8">
          <div className="text-5xl opacity-20">🎯</div>
          <p className="text-white/30 text-sm max-w-xs">
            Describe your startup in the chat to generate a stunning pitch deck.
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'outline-review') {
    return (
      <div className="h-full bg-[#080810]">
        <OutlineReview onGenerate={() => void generateAllSlides()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#080810]">
      {phase === 'generating' && (
        <div className="px-6 py-3 border-b border-white/8 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50">Generating with Nano Banana 2...</span>
            <span className="text-xs font-mono text-white/30">{doneCount}/{totalCount}</span>
          </div>
          <Progress value={progressPct} className="h-1 bg-white/10" />
        </div>
      )}

      {phase === 'done' && (
        <div className="px-6 py-3 border-b border-white/8 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">{outline?.deckTitle}</h2>
            <p className="text-xs text-white/40">{doneCount} slides generated</p>
          </div>
          <button
            onClick={() =>
              slides.filter((s) => s.status === 'done').forEach((s) => downloadSlide(s.index))
            }
            className="text-xs text-white/40 hover:text-violet-400 border border-white/10 hover:border-violet-500/50 px-3 py-1.5 rounded-lg transition-colors"
          >
            Download All PNGs
          </button>
        </div>
      )}

      <ScrollArea className="flex-1 px-6">
        <div className="py-4 grid grid-cols-2 gap-4">
          {slides.map((slide) => (
            <div key={slide.index} className="space-y-1.5">
              <SlideCard slide={slide} isActive={activeSlide === slide.index} />
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-white/40 truncate flex-1">{slide.outline.title}</p>
                {slide.status === 'done' && (
                  <button
                    onClick={() => downloadSlide(slide.index)}
                    className="text-[10px] text-white/20 hover:text-violet-400 ml-2 shrink-0 transition-colors"
                  >
                    ↓
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
