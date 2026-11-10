import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';

export default function ConnectDeviceCard({ onPair }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 6) {
      setError('Pairing codes are six characters.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onPair({ code: clean, name: name.trim() });
      setCode('');
      setName('');
    } catch (err) {
      setError(err.message || 'That code could not be used.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-dashed border-border bg-card/30 p-5">
      <div className="flex items-center gap-2">
        <Plus className="h-3.5 w-3.5 text-primary" />
        <p className="label-micro text-foreground">Connect a computer</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        Run the installer on that machine, then type the code it shows here.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Pairing code">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="A1B2C3"
            maxLength={6}
            className="font-mono uppercase tracking-[0.24em]"
          />
        </Field>
        <Field label="Name (optional)">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Studio iMac"
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={busy}>
          {busy ? 'Sending…' : 'Request'}
        </Button>
      </div>

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
