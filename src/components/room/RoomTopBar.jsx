import { useState } from 'react';
import { Copy, Check, ArrowLeft, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function RoomTopBar({ code, mode, live, viewers, right }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      /* clipboard blocked — the code is on screen anyway */
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Back to home"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            {mode === 'help' ? 'Remote help' : 'Mirror'}
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="group flex items-center gap-2 font-mono text-lg tracking-[0.3em] text-foreground"
            title="Copy code"
          >
            {code}
            {copied ? (
              <Check className="h-3.5 w-3.5 text-accent" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] ${
            live
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-border text-muted-foreground'
          }`}
        >
          <Radio className="h-3 w-3" />
          {live ? 'Live' : 'Standing by'}
        </span>
        {typeof viewers === 'number' && (
          <span className="rounded-full border border-border px-3 py-1 text-[11px] text-muted-foreground">
            {viewers} watching
          </span>
        )}
        {right}
      </div>
    </div>
  );
}