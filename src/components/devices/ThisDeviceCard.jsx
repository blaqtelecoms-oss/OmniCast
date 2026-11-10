import { MonitorUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PLATFORMS } from '@/lib/deviceInstallers';

export default function ThisDeviceCard({ stream, starting, onToggle, platform, notice }) {
  const label = PLATFORMS.find((entry) => entry.id === platform)?.name || 'This computer';

  return (
    <section className="overflow-hidden rounded-xl border border-border/80 bg-card/60">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <p className="label-micro">This browser</p>
          <h2 className="mt-2 font-display text-2xl tracking-tight">{label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {stream ? 'Your screen is being published right now.' : 'Nothing is leaving this computer yet.'}
          </p>
        </div>
        <Button variant={stream ? 'danger' : 'primary'} onClick={onToggle} disabled={starting}>
          {stream ? <Square className="h-3.5 w-3.5" /> : <MonitorUp className="h-4 w-4" />}
          {starting ? 'Opening picker…' : stream ? 'Stop sharing' : 'Share this screen'}
        </Button>
      </div>

      <div className="relative aspect-[16/7] w-full border-t border-border/70 bg-background/70">
        {stream ? (
          <>
            <video
              autoPlay
              muted
              playsInline
              ref={(node) => {
                if (node && node.srcObject !== stream) node.srcObject = stream;
              }}
              className="h-full w-full object-contain"
            />
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/85 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              Live
            </span>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Preview
            </p>
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Choose a window, a tab or the whole desktop. The preview stays on this screen.
            </p>
          </div>
        )}
      </div>

      {notice ? (
        <p className="border-t border-border/70 px-5 py-3 text-xs text-muted-foreground">{notice}</p>
      ) : null}
    </section>
  );
}
