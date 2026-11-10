import { useState } from 'react';
import { ArrowDownToLine, Check, ShieldCheck } from 'lucide-react';
import { buildInstaller, downloadText, PLATFORMS } from '@/lib/deviceInstallers';

const STEPS = [
  'Download the file for this computer.',
  'Open it once — it installs the companion and pairs this computer.',
  'Allow the permission prompt your system shows for input control.',
];

export default function InstallCompanion({ platform, onDownload }) {
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState(false);

  const grab = async (target) => {
    setBusy(target);
    try {
      const config = await onDownload(target);
      if (!config) return;
      const meta = PLATFORMS.find((item) => item.id === target);
      downloadText(meta.file, buildInstaller(target, config));
      setDone(true);
    } finally {
      setBusy('');
    }
  };

  const current = PLATFORMS.find((item) => item.id === platform) || PLATFORMS[0];

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            Companion app
          </p>
          <h2 className="mt-1.5 text-[15px] font-medium text-foreground">
            Install it once — no commands to type
          </h2>
        </div>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      </div>

      <ol className="mt-4 space-y-2">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border font-mono text-[9px] text-foreground">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => grab(current.id)}
        disabled={Boolean(busy)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        {done ? <Check className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}
        {busy ? 'Preparing…' : `Download for ${current.name}`}
      </button>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PLATFORMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => grab(item.id)}
            disabled={Boolean(busy)}
            className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
              item.id === current.id
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
        The installer adds a {current.shell.toLowerCase()} entry so the computer stays reachable after
        a restart or a new sign-in, until you remove it.
      </p>
    </section>
  );
}