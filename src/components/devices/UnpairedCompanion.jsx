import { Laptop } from 'lucide-react';
import { PLATFORMS } from '@/lib/deviceInstallers';

export default function UnpairedCompanion({ platform }) {
  const label = PLATFORMS.find((entry) => entry.id === platform)?.name || 'this computer';

  return (
    <section className="rounded-xl border border-border/80 bg-card/40 p-5">
      <div className="flex items-center gap-2">
        <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="label-micro">Not paired</p>
      </div>
      <h2 className="mt-2 font-display text-2xl tracking-tight">No agent on {label}</h2>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        You can share from this browser without installing anything. The agent only adds the ability to
        bring this machine into a session while it sits unattended.
      </p>
      <a
        href="#installer"
        className="focus-ring mt-4 inline-flex h-9 items-center justify-center rounded-full border border-border px-4 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/60"
      >
        Show the installer
      </a>
    </section>
  );
}
