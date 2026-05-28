// client/src/components/deck/SlideCard.tsx
import type { GeneratedSlide } from '@/lib/types'

interface Props {
  slide: GeneratedSlide
  isActive?: boolean
}

export function SlideCard({ slide, isActive = false }: Props) {
  const { status, imageDataUrl, outline } = slide

  return (
    <div
      className={`relative rounded-xl overflow-hidden border transition-all duration-300 ${
        isActive
          ? 'border-violet-500 shadow-[0_0_20px_rgba(124,58,237,0.3)]'
          : 'border-white/10'
      }`}
      style={{ aspectRatio: '16/9' }}
    >
      {status === 'done' && imageDataUrl && (
        <img src={imageDataUrl} alt={outline.title} className="w-full h-full object-cover" />
      )}

      {status === 'generating' && (
        <div className="w-full h-full animate-pulse bg-gradient-to-br from-violet-900/30 via-white/5 to-fuchsia-900/20" />
      )}

      {status === 'pending' && (
        <div className="w-full h-full bg-white/3 flex items-center justify-center">
          <span className="text-white/15 text-xs font-mono">Slide {outline.index}</span>
        </div>
      )}

      {status === 'error' && (
        <div className="w-full h-full bg-red-950/50 flex flex-col items-center justify-center gap-1 p-3">
          <span className="text-red-400 text-xs">⚠ Failed</span>
          <span className="text-red-400/50 text-[10px] text-center line-clamp-2">
            {slide.errorMessage}
          </span>
        </div>
      )}

      {/* Slide number */}
      <div className="absolute top-2 left-2">
        <span className="bg-black/60 backdrop-blur-sm text-white/50 text-[10px] font-mono px-1.5 py-0.5 rounded">
          {outline.index}
        </span>
      </div>

      {status === 'done' && (
        <div className="absolute top-2 right-2">
          <span className="bg-green-500/80 text-white text-[10px] px-1.5 py-0.5 rounded">✓</span>
        </div>
      )}
      {status === 'generating' && (
        <div className="absolute top-2 right-2">
          <span className="bg-violet-500/80 text-white text-[10px] px-1.5 py-0.5 rounded animate-pulse">
            ✨
          </span>
        </div>
      )}
    </div>
  )
}
