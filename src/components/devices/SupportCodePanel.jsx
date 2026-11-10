import { useEffect, useState } from 'react';
import { Check, Copy, LifeBuoy, Loader2, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const ask = (payload) => base44.functions.invoke('deviceService', payload);
const clock = (ms) => {
  const total = Math.max(Math.ceil(ms / 1000), 0);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * The owner's side of helping someone else. A six-character code is minted here,
 * read out to whoever is helping, and stops working once used or after fifteen
 * minutes — their account never has to be handed over for this.
 */
export default function SupportCodePanel({ device }) {
  const [code, setCode] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(0);
      return;
    }
    const tick = () => {
      const left = expiresAt - Date.now();
      setSecondsLeft(Math.max(left, 0));
      if (left <= 0) {
        setCode('');
        setLive(false);
        setExpiresAt(0);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // A reloaded page cannot show the digits again (only their digest is stored),
  // but it can say that a code is still out there.
  useEffect(() => {
    let alive = true;
    ask({ action: 'support-status', device_id: device.device_id })
      .then((res) => {
        const data = res.data || {};
        if (!alive || !data.active) return;
        setLive(true);
        setExpiresAt(new Date(data.expires_at).getTime());
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [device.device_id]);

  const issue = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await ask({ action: 'issue-support-code', device_id: device.device_id });
      const data = res.data || {};
      if (data.error || !data.code) {
        setError(data.error || 'A help code could not be made. Please try again.');
        return;
      }
      setCode(data.code);
      setExpiresAt(new Date(data.expires_at).getTime());
      setLive(true);
    } catch (err) {
      setError(err.message || 'A help code could not be made. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await ask({ action: 'stop-support', device_id: device.device_id });
    } catch (err) {
      /* the code expires on its own either way */
    } finally {
      setCode('');
      setLive(false);
      setExpiresAt(0);
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="mt-5 border-t border-border/70 pt-4">
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
        <LifeBuoy className="h-3.5 w-3.5 text-primary" />
        Let someone else help this computer
      </p>
      <p className="mt-1 max-w-[46ch] text-[11.5px] leading-relaxed text-muted-foreground">
        They can have a different account — give them the code below and they enter it under
        “Help someone”. You still read them the six-digit PIN before anything opens.
      </p>

      {code ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 transition-colors hover:border-primary/60"
            >
              <span className="font-mono text-[24px] tracking-[0.24em] text-foreground">{code}</span>
              {copied ? (
                <Check className="h-4 w-4 text-accent" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              {clock(secondsLeft)} left
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={issue}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className="h-3 w-3" />
              New code
            </button>
            <button
              type="button"
              onClick={stop}
              disabled={busy}
              className="rounded-full border border-border px-3.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
            >
              Cancel code
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={issue}
            disabled={busy}
            className="flex items-center gap-2 rounded-full border border-primary/50 bg-primary/10 px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-primary/20 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LifeBuoy className="h-3.5 w-3.5" />}
            {live ? 'Show a new code' : 'Create a help code'}
          </button>
          {live && (
            <span className="text-[11.5px] text-muted-foreground">
              A code is still live for {clock(secondsLeft)} — the digits can only be shown once.
            </span>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}
