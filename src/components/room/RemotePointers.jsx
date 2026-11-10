import { useEffect, useRef, useState } from 'react';
import { MousePointer2 } from 'lucide-react';
import { useRoomEvents } from './useRoomFeed';

export default function RemotePointers({ sessionId }) {
  const [pointer, setPointer] = useState(null);
  const [ripple, setRipple] = useState(null);
  const [note, setNote] = useState(null);
  const timers = useRef([]);

  const fade = (setter, delay) => {
    const timer = setTimeout(() => setter(null), delay);
    timers.current.push(timer);
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useRoomEvents(sessionId, (event) => {
    if (event.kind === 'pointer') {
      setPointer({ x: event.x, y: event.y, name: event.sender_name });
      fade(setPointer, 3200);
    }
    if (event.kind === 'click') {
      setPointer({ x: event.x, y: event.y, name: event.sender_name });
      setRipple({ x: event.x, y: event.y, id: event.id });
      fade(setRipple, 900);
      fade(setPointer, 2400);
    }
    if (event.kind === 'note') {
      setNote({ text: event.text, name: event.sender_name, x: event.x, y: event.y });
      fade(setNote, 6000);
    }
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pointer && (
        <div
          className="absolute will-change-[left,top] transition-[left,top] duration-100 ease-linear"
          style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}
        >
          <MousePointer2
            className="-ml-1 -mt-1 h-5 w-5 text-accent drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            fill="currentColor"
          />
          {pointer.name && (
            <span className="mt-1 block whitespace-nowrap rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-foreground ring-1 ring-border">
              {pointer.name}
            </span>
          )}
        </div>
      )}

      {ripple && (
        <div
          key={ripple.id}
          className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-primary/70"
          style={{ left: `${ripple.x * 100}%`, top: `${ripple.y * 100}%` }}
        />
      )}

      {note && (
        <div
          className="absolute max-w-[220px] -translate-x-1/2 translate-y-3 rounded-xl border border-border bg-background/95 px-3 py-2 text-[12px] leading-snug text-foreground shadow-xl"
          style={{ left: `${Math.min(Math.max(note.x, 0.12), 0.88) * 100}%`, top: `${note.y * 100}%` }}
        >
          <span className="mb-0.5 block font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            {note.name || 'viewer'}
          </span>
          {note.text}
        </div>
      )}
    </div>
  );
}