import { useState } from 'react';
import { Download, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PLATFORMS, buildInstaller, downloadText } from '@/lib/deviceInstallers';
import { cn } from '@/lib/utils';

export default function InstallCompanion({ platform, token = '' }) {
  const [selected, setSelected] = useState(platform || 'windows');
  const [done, setDone] = useState('');

  const download = () => {
    const installer = buildInstaller({ platform: selected, origin: window.location.origin, token });
    downloadText(installer.filename, installer.content);
    setDone(installer.filename);
  };

  const entry = PLATFORMS.find((item) => item.id === selected) || PLATFORMS[0];

  return (
    <section id="installer" className="rounded-xl border border-border/80 bg-card/50 p-5">
      <p className="label-micro">Companion agent</p>
      <h2 className="mt-2 font-display text-2xl tracking-tight">Pair another computer</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        The agent runs in the background so a machine can be woken up from anywhere. It stays off until
        you share.
      </p>

      <div className="mt-4 flex flex-wrap gap-1 rounded-full bg-secondary/70 p-1">
        {PLATFORMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelected(item.id)}
            aria-pressed={selected === item.id}
            className={cn(
              'focus-ring rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              selected === item.id
                ? 'bg-background text-foreground shadow'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {item.name}
          </button>
        ))}
      </div>

      <dl className="mt-4 space-y-2 text-xs text-muted-foreground">
        <div className="flex justify-between gap-4">
          <dt>Installer</dt>
          <dd className="font-mono text-foreground/80">{entry.file}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Runs under</dt>
          <dd className="text-foreground/80">{entry.shell}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Supported systems</dt>
          <dd className="text-foreground/80">{entry.detail}</dd>
        </div>
      </dl>

      <Button variant="secondary" className="mt-4 w-full" onClick={download}>
        <Download className="h-4 w-4" />
        Download {entry.file}
      </Button>

      {done ? (
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <span>
            Saved <span className="font-mono text-foreground/80">{done}</span>. Run it on that computer,
            then paste the six-character code it prints above.
          </span>
        </p>
      ) : null}
    </section>
  );
}
