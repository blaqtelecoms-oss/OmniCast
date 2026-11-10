import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function SharePublisher({ hasStream }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const room = await base44.rooms.create({ name: 'Quick publish' });
      setCode(room.code);
      navigate(`/room/${room.code}`);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="rounded-xl border border-border/80 bg-gradient-to-b from-primary/[0.07] to-transparent p-5">
      <div className="flex items-center gap-2">
        <Radio className="h-3.5 w-3.5 text-primary" />
        <p className="label-micro text-primary">Publish</p>
      </div>
      <h2 className="mt-2 font-display text-2xl tracking-tight">Send this screen to a room</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {hasStream
          ? 'Your screen is live. Open a room and hand the code to whoever needs to see it.'
          : 'Open a room first, then share the code. The screen you pick stays peer to peer.'}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={create} disabled={busy}>
          {busy ? 'Opening…' : 'Open a room'}
        </Button>
        {code ? (
          <button
            type="button"
            onClick={copy}
            className="focus-ring flex h-11 items-center gap-2 rounded-full border border-border px-4 font-mono text-xs tracking-[0.24em] text-foreground transition-colors hover:bg-secondary/60"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
            {code}
          </button>
        ) : null}
      </div>
    </section>
  );
}
