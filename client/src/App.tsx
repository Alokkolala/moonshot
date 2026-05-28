// client/src/App.tsx
import { ChatPanel } from '@/components/chat/ChatPanel'
import { DeckPreview } from '@/components/deck/DeckPreview'

export default function App() {
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#080810] text-white">
      {/* Top bar */}
      <header className="h-12 shrink-0 bg-[#0D0D14]/80 backdrop-blur border-b border-white/8 flex items-center px-6 z-50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Moonshot
          </span>
          <span className="text-xs text-white/20">AI Pitch Deck Generator</span>
        </div>
        <div className="ml-auto text-xs text-white/20 font-mono">Nano Banana 2</div>
      </header>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-[380px] shrink-0 border-r border-white/8 overflow-hidden">
          <ChatPanel />
        </aside>
        <main className="flex-1 overflow-hidden">
          <DeckPreview />
        </main>
      </div>
    </div>
  )
}
