// client/src/components/chat/ChatMessage.tsx
import type { ChatMessage as ChatMessageType } from '@/lib/types'

interface Props {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-violet-600 text-white rounded-br-sm'
            : 'bg-white/8 text-white/85 rounded-bl-sm border border-white/10'
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  )
}
