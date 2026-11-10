import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function JoinPanel({ onJoin }) {
  const [code, setCode] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const clean = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
    if (clean.length < 6) return;
    onJoin(clean);
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-3xl border border-border bg-secondary/30 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background/60 ring-1 ring-border">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
        </span>
        <div>
          <p className="text-sm font-medium">Joining someone?</p>
          <p className="text-[13px] text-muted-foreground">
            Enter the 6-character code from their screen.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="A1B2C3"
          inputMode="text"
          autoCapitalize="characters"
          maxLength={6}
          aria-label="Session code"
          className="h-12 w-[168px] border-border bg-background text-center font-mono text-lg tracking-[0.35em] placeholder:text-muted-foreground/50"
        />
        <button
          type="submit"
          className="h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          disabled={code.replace(/[^a-zA-Z0-9]/g, '').length < 6}
        >
          Join
        </button>
      </div>
    </form>
  );
}