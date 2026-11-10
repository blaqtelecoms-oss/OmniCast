import { useEffect, useState } from 'react';
import { ArrowRight, KeyRound } from 'lucide-react';

export default function ConnectDeviceCard({ onConnect, preset }) {
  const [code, setCode] = useState(preset || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (preset) setCode(String(preset));
  }, [preset]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (code.replace(/\D/g, '').length !== 9) {
      setError('A device ID is nine digits.');
      return;
    }
    setBusy(true);
    try {
      const problem = await onConnect({ deviceId: code.replace(/\D/g, ''), password });
      if (problem) setError(problem);
    } catch (err) {
      setError(err.response?.data?.error || err.data?.error || err.message || 'Could not reach the device. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
        Connect to a device
      </p>
      <h2 className="mt-1.5 text-[15px] font-medium text-foreground">Any desk, by its ID</h2>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block">
          <span className="text-[11px] text-muted-foreground">Device ID</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^\d ]/g, '').slice(0, 11))}
            inputMode="numeric"
            placeholder="123 456 789"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-center font-mono text-lg tracking-[0.22em] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50"
          />
        </label>

        <label className="block">
          <span className="text-[11px] text-muted-foreground">
            Unattended password <span className="text-muted-foreground/60">(if one is set)</span>
          </span>
          <div className="relative mt-1">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="off"
              placeholder="Leave empty to ask them to approve"
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/50"
            />
          </div>
        </label>

        {error && <p className="text-[11.5px] text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-[12.5px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 disabled:opacity-60"
        >
          {busy ? 'Connecting…' : 'Connect'}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </form>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
        Without a password the person at that computer has to approve you first. The device ID alone
        never grants control.
      </p>
    </section>
  );
}