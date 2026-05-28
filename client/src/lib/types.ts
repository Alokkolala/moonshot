// shared/types.ts

export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
}

export interface BrandConfig {
  primaryColor: string      // hex e.g. "#6C3FE8"
  secondaryColor: string    // hex e.g. "#F5A623"
  backgroundColor: string   // hex e.g. "#0A0A0F"
  textColor: string         // hex e.g. "#FFFFFF"
  fontFamily: string        // e.g. "Inter"
  companyName: string
  logoDescription: string   // text description of logo/identity
  styleKeywords: string[]   // e.g. ["minimalist", "bold", "tech"]
}

export interface SlideOutline {
  index: number
  type: 'title' | 'problem' | 'solution' | 'market' | 'product' | 'traction' | 'team' | 'ask' | 'custom'
  title: string
  keyPoints: string[]
  visualDirection: string  // vivid description of imagery and layout
  speakerNotes: string
}

export interface DeckOutline {
  deckTitle: string
  tagline: string
  totalSlides: number
  slides: SlideOutline[]
}

export type SlideStatus = 'pending' | 'generating' | 'done' | 'error'

export interface GeneratedSlide {
  index: number
  outline: SlideOutline
  status: SlideStatus
  imageDataUrl: string | null
  errorMessage: string | null
}
