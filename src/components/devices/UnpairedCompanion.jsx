import { ArrowDownToLine, Copy, Laptop, Link2, Loader2 } from 'lucide-react';
import { useState } from 'react';

/**
 * Shown when OmniCast is running on this computer but that device is not in the
 * account's list — for example right after the device was removed, or because it
 * was set up under another OmniCast account. The number the computer paired as
 * still belongs here, so it stays on screen and can be added back in one click.
 */
export default function UnpairedCompanion({ number, canPair = false, busy = false, onPair, onInstall }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const copy = async () => {
    await navigator.clipboard.writeText(String(number));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const pair = async () => {
    setError('');
    const problem = await onPair();
    if (problem) setError(problem);
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card/60 p-6">
      <div className="pointer-events-none absolute inset-0 ink-glow opacity-70" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            This computer
          </p>
          <p className="mt-1.5 text-[15px] font-medium text-foreground">OmniCast is running here</p>
        </div>
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
          <Laptop className="h-3.5 w-3.5" />
        </span>
      </div>

      {number ? (
        <button
          type="button"
          onClick={copy}
          className="relative mt-5 flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-4 py-3 transition-colors hover:border-primary/40"
        >
          <span className="font-mono text-[26px] tracking-[0.2em] text-foreground sm:text-[30px]">
            {String(number).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}
          </span>
          {copied ? (
            <Copy className="h-4 w-4 text-accent" />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      ) : (
        <p className="relative mt-5 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-[12.5px] text-muted-foreground">
          The companion has not reported its number yet. Restart it, or install it again below, and
          the number appears here.
        </p>
      )}

      <p className="relative mt-4 max-w-[52ch] text-[12.5px] leading-relaxed text-muted-foreground">
        This number cannot be connected to yet: the device is not in your list — it was removed, or
        it was set up under another OmniCast account.
      </p>

      <div className="relative mt-4">
        {canPair ? (
          <button
            type="button"
            onClick={pair}
            disabled={busy}
            className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            {busy ? 'Adding this computer…' : 'Add this computer to my account'}
          </button>
        ) : (
          // The copy installed on this computer is older than this page, so it cannot
          // be added from the browser. Installing the current one keeps the number
          // above: the companion pairs itself with that same number.
          <>
            <p className="max-w-[52ch] text-[11.5px] leading-relaxed text-muted-foreground">
              The copy of OmniCast on this computer is older than this page, so it cannot be added
              from here. Press the button below — it installs the current companion for this
              computer with the number above, and pairs it on its own.
            </p>
            {onInstall && (
              <button
                type="button"
                onClick={onInstall}
                className="mt-3 flex items-center gap-2 rounded-full border border-primary/50 bg-primary/10 px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:border-primary/70"
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Pair this computer now
              </button>
            )}
          </>
        )}
        {error && <p className="mt-2 text-[11.5px] text-destructive">{error}</p>}
      </div>
    </section>
  );
}