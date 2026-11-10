import { useEffect, useState } from 'react';
import { MousePointer2 } from 'lucide-react';

/**
 * Renders the helper's live cursor, received over the WebRTC data channel.
 * `point` is a normalized { x, y, kind, at } payload in 0–1 range.
 */
export default function PeerPointer({ point, label = 'Helper' }) {
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (!point) return;
    setShown(point);
    const timer = setTimeout(() => setShown(null), point.kind === 'click' ? 1200 : 2600);
    return () => clearTimeout(timer);
  }, [point]);

  if (!shown) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {shown.kind === 'click' && (
        <div
          className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 border-primary/70"
          style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%` }}
        />
      )}
      <div
        className="absolute will-change-[left,top] transition-[left,top] duration-75 ease-linear"
        style={{ left: `${shown.x * 100}%`, top: `${shown.y * 100}%` }}
      >
        <MousePointer2
          className="-ml-1 -mt-1 h-5 w-5 text-accent drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
          fill="currentColor"
        />
        <span className="mt-1 block whitespace-nowrap rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-foreground ring-1 ring-border">
          {label}
        </span>
      </div>
    </div>
  );
}