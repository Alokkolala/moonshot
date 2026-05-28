// client/src/components/chat/ChatPanel.tsx
import { useState, useRef, useEffect } from 'react'
import { useDeckStore } from '@/store/deck-store'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { BrandPanel } from '@/components/chat/BrandPanel'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ChatMessage as ChatMessageType, DeckOutline } from '@/lib/types'

export function ChatPanel() {
  const {
    brand,
    messages,
    referenceImages,
    phase,
    isLoadingOutline,
    addMessage,
    addReferenceImage,
    removeReferenceImage,
    setOutline,
    setPhase,
    setIsLoadingOutline,
    initSlides,
  } = useDeckStore()

  const [input, setInput] = useState('')
  const [showBrand, setShowBrand] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleImageAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => addReferenceImage(reader.result as string)
      reader.readAsDataURL(file)
    })
    // Reset input so same file can be re-attached if needed
    e.target.value = ''
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || isLoadingOutline) return
    setInput('')

    const userMsg: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    addMessage(userMsg)

    // Trigger outline generation on first message or explicit request
    const userMessages = messages.filter((m) => m.role === 'user')
    const triggersGeneration =
      userMessages.length === 0 ||
      /generate|create|make|build/i.test(text)

    if (triggersGeneration && phase === 'chat') {
      await generateOutline(text, [...messages, userMsg])
    } else {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Got it! Say "generate my deck" when you\'re ready to create the outline.',
        timestamp: Date.now(),
      })
    }
  }

  async function generateOutline(
    latestMessage: string,
    allMessages: ChatMessageType[]
  ) {
    setIsLoadingOutline(true)
    addMessage({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: 'Analyzing your pitch and crafting the perfect slide structure...',
      timestamp: Date.now(),
    })

    const conversationContext = allMessages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n\n')

    try {
      const res = await fetch('/api/outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userDescription: latestMessage, brand, conversationContext, referenceImages }),
      })
      const data = await res.json() as { outline?: DeckOutline; error?: string }

      if (!res.ok || !data.outline) throw new Error(data.error ?? 'Failed to generate outline')

      setOutline(data.outline)
      initSlides(data.outline)
      setPhase('outline-review')

      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I've created a ${data.outline.totalSlides}-slide outline for "${data.outline.deckTitle}". Review it on the right and click Generate when ready!`,
        timestamp: Date.now(),
      })
    } catch (err) {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, hit an error: ${err instanceof Error ? err.message : 'Unknown'}. Please try again.`,
        timestamp: Date.now(),
      })
    } finally {
      setIsLoadingOutline(false)
    }
  }

  const isDisabled = phase === 'generating' || phase === 'done'

  return (
    <div className="flex flex-col h-full bg-[#0D0D14]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <h2 className="text-sm font-semibold text-white/80">Chat</h2>
        <button
          onClick={() => setShowBrand((v) => !v)}
          className="text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          {showBrand ? 'Hide Brand' : 'Brand Settings'}
        </button>
      </div>

      {showBrand && <BrandPanel />}

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-2">
              <p className="text-3xl">🚀</p>
              <p className="text-white/50 text-sm">
                Describe your startup and what you need in your pitch deck.
              </p>
              <p className="text-white/30 text-xs">
                Include the problem, solution, market, and your ask.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {isLoadingOutline && (
            <div className="flex justify-start">
              <div className="bg-white/8 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1 items-center">
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/8 space-y-2">

        {/* Reference image thumbnails */}
        {referenceImages.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {referenceImages.map((url, i) => (
              <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-white/10 shrink-0">
                <img src={url} alt={`ref ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeReferenceImage(i)}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-lg"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder={
            isDisabled ? 'Deck is generating...' : 'Describe your startup, product, market...'
          }
          disabled={isDisabled}
          rows={3}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
        />

        <div className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageAttach}
          />
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled}
            title="Attach reference images"
            className="flex items-center justify-center w-10 h-10 rounded-lg border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 hover:bg-white/5 transition-colors disabled:opacity-30 shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>

          <Button
            onClick={() => void handleSend()}
            disabled={!input.trim() || isDisabled || isLoadingOutline}
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
          >
            {isLoadingOutline ? 'Generating outline...' : 'Send  ↵'}
          </Button>
        </div>
      </div>
    </div>
  )
}
