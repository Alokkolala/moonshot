// client/src/store/deck-store.ts
import { create } from 'zustand'
import type {
  ChatMessage,
  BrandConfig,
  DeckOutline,
  GeneratedSlide,
  SlideStatus,
} from '@/lib/types'

function defaultBrand(): BrandConfig {
  return {
    primaryColor: '#6C3FE8',
    secondaryColor: '#F5A623',
    backgroundColor: '#0A0A0F',
    textColor: '#FFFFFF',
    fontFamily: 'Inter',
    companyName: '',
    logoDescription: '',
    styleKeywords: ['clean', 'bold', 'modern'],
  }
}

type Phase = 'chat' | 'outline-review' | 'generating' | 'done'

interface DeckState {
  brand: BrandConfig
  messages: ChatMessage[]
  outline: DeckOutline | null
  slides: GeneratedSlide[]
  phase: Phase
  isLoadingOutline: boolean
}

interface DeckActions {
  setBrand: (updates: Partial<BrandConfig>) => void
  addMessage: (msg: ChatMessage) => void
  setOutline: (outline: DeckOutline) => void
  setPhase: (phase: Phase) => void
  setIsLoadingOutline: (loading: boolean) => void
  initSlides: (outline: DeckOutline) => void
  setSlideStatus: (
    index: number,
    status: SlideStatus,
    imageDataUrl?: string,
    errorMessage?: string
  ) => void
  reset: () => void
}

export const useDeckStore = create<DeckState & DeckActions>()((set) => ({
  brand: defaultBrand(),
  messages: [],
  outline: null,
  slides: [],
  phase: 'chat',
  isLoadingOutline: false,

  setBrand: (updates) =>
    set((s) => ({ brand: { ...s.brand, ...updates } })),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  setOutline: (outline) => set({ outline }),

  setPhase: (phase) => set({ phase }),

  setIsLoadingOutline: (loading) => set({ isLoadingOutline: loading }),

  initSlides: (outline) =>
    set({
      slides: outline.slides.map((slide) => ({
        index: slide.index,
        outline: slide,
        status: 'pending' as SlideStatus,
        imageDataUrl: null,
        errorMessage: null,
      })),
    }),

  setSlideStatus: (index, status, imageDataUrl, errorMessage) =>
    set((s) => ({
      slides: s.slides.map((slide) =>
        slide.index === index
          ? {
              ...slide,
              status,
              imageDataUrl: imageDataUrl ?? slide.imageDataUrl,
              errorMessage: errorMessage ?? slide.errorMessage,
            }
          : slide
      ),
    })),

  reset: () =>
    set({
      brand: defaultBrand(),
      messages: [],
      outline: null,
      slides: [],
      phase: 'chat',
      isLoadingOutline: false,
    }),
}))
