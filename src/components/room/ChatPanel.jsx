import { useEffect, useRef, useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { useRoomMessages } from './useRoomFeed';

export default function ChatPanel({ sessionId, me, compact = false }) {
  const messages = useRoomMessages(sessionId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setText('');
    try {
      await base44.entities.RoomMessage.create({
        session_id: sessionId,
        sender_id: me?.id || '',
        sender_name: me?.full_name || me?.email || 'Guest',
        text: value.slice(0, 500),
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col rounded-2xl border border-border bg-card/60">
      <div className="flex items-center gap-2 border-b border-border/80 px-4 py-3">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[13px] font-medium">Room chat</span>
      </div>

      <div
        className={`no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-3 ${compact ? 'max-h-52' : 'min-h-[180px]'}`}
      >
        {messages.length === 0 && (
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            Messages stay with the session. Use it to explain what to click next.
          </p>
        )}
        {messages.map((message) => {
          const mine = message.sender_id && message.sender_id === me?.id;
          return (
            <div key={message.id} className={mine ? 'text-right' : ''}>
              <span className="mb-0.5 block font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                {mine ? 'You' : message.sender_name || 'Guest'}
              </span>
              <span
                className={`inline-block max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-snug ${
                  mine
                    ? 'bg-primary/15 text-foreground'
                    : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {message.text}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="flex items-center gap-2 border-t border-border/80 p-3">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          className="h-10 border-border bg-background text-[13px]"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}