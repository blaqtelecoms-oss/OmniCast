import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

// How often the phone asks whether the computer has put digits on its screen yet.
const POLL_MS = 2000;

const COPY = {
  waiting: {
    title: 'Authorizing remote access',
    body: 'The PIN appears on that computer. If nobody is there, nothing will happen.',
  },
  live: {
    title: 'Authorizing remote access',
    body: 'Enter the 6-digit PIN currently displayed on your PC.',
  },
  invalid: {
    title: 'That PIN was not right',
    body: 'Check the digits on the computer — the current PIN is shown there.',
  },
  expired: {
    title: 'That PIN expired',
    body: 'PINs last 60 seconds. A fresh one is being shown on the computer now.',
  },
  locked: {
    title: 'Too many wrong PINs',
    body: 'This request is closed. End it and start a new connection.',
  },
  gone: {
    title: 'This request has ended',
    body: 'The connection was closed before it was authorized.',
  },
};

/**
 * The gate between watching and controlling. A session stays pending until the
 * six digits shown on the computer are typed here, so holding the phone is not
 * the same as holding the keyboard.
 */
export default function PairingPin({ record, onVerified, onCancel }) {
  const [pin, setPin] = useState('');
  const [state, setState] = useState('waiting');
  const [message, setMessage] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [checking, setChecking] = useState(false);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const busy = useRef(false);
  const verified = useRef(onVerified);
  verified.current = onVerified;

  // What the computer is showing right now: whether digits exist, expired, or were
  // used up. Nobody types into a request that is already over.
  useEffect(() => {
    let stopped = false;

    const tick = async () => {
      const res = await base44.functions
        .invoke('deviceService', { action: 'pin-status', device_session_id: record.id })
        .catch(() => null);
      const data = res?.data || {};
      if (stopped) return;
      if (data.state === 'active') {
        verified.current?.();
        return;
      }
      if (!data.state) return;
      if (typeof data.attempts_left === 'number') setAttemptsLeft(data.attempts_left);
      if (data.expires_at) setExpiresAt(new Date(data.expires_at).getTime());
      // A request that was answered elsewhere ends this screen instead of leaving it
      // waiting for digits nobody will send.
      if (data.state === 'declined' || data.state === 'ended') {
        setState('gone');
        return;
      }
      setState((current) => {
        // A wrong guess is the phone's own business: the server still says "live",
        // and the message for it must not be wiped by the next poll.
        if (current === 'invalid' && data.state === 'live') return current;
        return data.state;
      });
    };

    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [record.id]);

  // A countdown, so nobody keeps typing digits that have already expired.
  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(0);
      return;
    }
    const update = () => setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const submit = useCallback(
    async (value) => {
      if (busy.current || value.length !== 6) return;
      busy.current = true;
      setChecking(true);
      setMessage('');
      try {
        const res = await base44.functions.invoke('deviceService', {
          action: 'verify-pin',
          device_session_id: record.id,
          pin: value,
        });
        const data = res.data || {};
        if (data.ok) {
          verified.current?.();
          return;
        }
        setPin('');
        if (typeof data.attempts_left === 'number') setAttemptsLeft(data.attempts_left);
        const code = data.code || 'invalid';
        setState(code === 'used' ? 'locked' : code);
        setMessage(data.error || 'That PIN was not accepted.');
      } catch (err) {
        setPin('');
        setMessage(err?.message || 'The PIN could not be checked. Try again.');
      } finally {
        busy.current = false;
        setChecking(false);
      }
    },
    [record.id]
  );

  const change = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setPin(digits);
    if (digits.length === 6) submit(digits);
  };

  const copy = COPY[state] || COPY.live;
  const accepting = state === 'live' || state === 'invalid';

  return (
    <div className="max-w-sm px-6 text-center">
      <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/60">
        {state === 'locked' || state === 'gone' ? (
          <TriangleAlert className="h-6 w-6 text-destructive" />
        ) : (
          <ShieldCheck className="h-6 w-6 text-primary" />
        )}
      </span>

      <p className="text-xl font-medium tracking-tight text-foreground">{copy.title}</p>
      <p className="mx-auto mt-2 max-w-[34ch] text-[13px] leading-relaxed text-muted-foreground">{copy.body}</p>

      {accepting && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <InputOTP maxLength={6} value={pin} onChange={change} inputMode="numeric" disabled={checking}>
            <InputOTPGroup className="gap-1.5">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <InputOTPSlot
                  key={index}
                  index={index}
                  className="h-12 w-10 rounded-lg border border-border bg-background/80 font-mono text-lg text-foreground first:rounded-lg first:border-l last:rounded-lg"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>

          {checking && (
            <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking…
            </span>
          )}
          {!checking && message && <span className="text-[11.5px] text-destructive">{message}</span>}
          {!checking && !message && (
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
              {attemptsLeft} {attemptsLeft === 1 ? 'try' : 'tries'} left
              {secondsLeft > 0 ? ` · ${secondsLeft}s` : ''}
            </span>
          )}
        </div>
      )}

      {state === 'waiting' && (
        <span className="mt-6 flex items-center justify-center gap-2 text-[11.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Waiting for the PIN to appear
        </span>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="mt-7 rounded-full border border-border px-4 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
      >
        {state === 'locked' || state === 'gone' ? 'Close this request' : 'Cancel request'}
      </button>
    </div>
  );
}
