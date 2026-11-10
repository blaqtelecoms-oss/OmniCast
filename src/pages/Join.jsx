import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, AlertCircle, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

export default function Join() {
  const navigate = useNavigate();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refs = useRef([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const code = digits.join('');

  const setAt = (index, value) => {
    const clean = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    setDigits((previous) => {
      const next = [...previous];
      next[index] = clean.slice(-1);
      return next;
    });
    if (clean && index < 5) refs.current[index + 1]?.focus();
  };

  const onKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      refs.current[index - 1]?.focus();
    }
  };

  const onPaste = (event) => {
    const text = event.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (!text) return;
    event.preventDefault();
    const next = ['', '', '', '', '', ''];
    text.slice(0, 6).split('').forEach((char, index) => {
      next[index] = char;
    });
    setDigits(next);
    refs.current[Math.min(text.length, 5)]?.focus();
  };

  const submit = async (event) => {
    event.preventDefault();
    if (code.length < 6) {
      setError('Type the full six-character code.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const room = await base44.rooms.peek(code);
      if (!room?.exists) {
        setError('No live room uses that code. Ask for a fresh one.');
        return;
      }
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err.message || 'That code could not be checked.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8 sm:py-24">
      <div className="rounded-xl border border-border/80 bg-card/60 p-7 shadow-xl sm:p-9">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/12 text-primary">
          <KeyRound className="h-4 w-4" />
        </span>
        <p className="label-micro mt-5">Join a session</p>
        <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">What's the code?</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The person sharing has six characters for you. Paste the whole thing if that's easier.
        </p>

        <form onSubmit={submit} className="mt-7">
          <div className="flex gap-2" onPaste={onPaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  refs.current[index] = node;
                }}
                value={digit}
                onChange={(event) => setAt(index, event.target.value)}
                onKeyDown={(event) => onKeyDown(index, event)}
                aria-label={`Code character ${index + 1}`}
                inputMode="text"
                autoComplete="off"
                maxLength={1}
                className="focus-ring h-14 w-full rounded-lg border border-input bg-background text-center font-mono text-xl uppercase tracking-widest text-foreground"
              />
            ))}
          </div>

          {error ? (
            <p className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs leading-relaxed text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy || code.length < 6}>
            {busy ? 'Joining…' : 'Join the session'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        <p className="mt-5 text-xs text-muted-foreground">
          Sharing instead?{' '}
          <Link to="/room/new" className="font-medium text-foreground underline-offset-4 hover:underline">
            Open your own room
          </Link>
        </p>
      </div>
    </div>
  );
}
