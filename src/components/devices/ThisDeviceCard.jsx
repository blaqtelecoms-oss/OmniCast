import { useState } from 'react';
import { Check, Copy, Loader2, MonitorUp, Square } from 'lucide-react';
import StatusDot from './StatusDot';
import DeviceReadiness from './DeviceReadiness';
import UnattendedPanel from './UnattendedPanel';

export default function ThisDeviceCard({ device, sharing, starting, onToggleShare, onSaveUnattended }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(String(device.device_id));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-card/60 p-6">
      <div className="pointer-events-none absolute inset-0 ink-glow opacity-70" />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            This computer
          </p>
          <p className="mt-1.5 text-[15px] font-medium text-foreground">{device.label}</p>
        </div>
        <StatusDot status={device.status} />
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <DeviceReadiness device={device} />
        {device.readiness_note && (
          <span className="text-[11px] leading-relaxed text-muted-foreground">{device.readiness_note}</span>
        )}
      </div>

      <button
        type="button"
        onClick={copy}
        className="relative mt-5 flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-4 py-3 transition-colors hover:border-primary/40"
      >
        <span className="font-mono text-[26px] tracking-[0.2em] text-foreground sm:text-[30px]">
          {String(device.device_id).replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}
        </span>
        {copied ? (
          <Check className="h-4 w-4 text-accent" />
        ) : (
          <Copy className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {device.status === 'pairing' && (
        <p className="relative mt-4 rounded-xl border border-border/70 bg-background/40 px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Not paired yet. Open the installer you downloaded on this computer and leave it for a
          minute — it pairs this number by itself.
        </p>
      )}

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleShare}
          disabled={starting}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium transition-colors disabled:opacity-70 ${
            sharing
              ? 'border border-destructive/40 text-destructive hover:bg-destructive/10'
              : 'border border-border text-foreground hover:bg-secondary'
          }`}
        >
          {starting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : sharing ? (
            <Square className="h-3 w-3" />
          ) : (
            <MonitorUp className="h-3.5 w-3.5" />
          )}
          {starting ? 'Starting…' : sharing ? 'Stop sharing this screen' : 'Share this screen now'}
        </button>
        <span className="text-[11px] text-muted-foreground">
          {sharing ? 'Anyone you invited can see and control this screen.' : 'Screen view runs from this page'}
        </span>
      </div>

      <UnattendedPanel device={device} onSave={onSaveUnattended} />
    </section>
  );
}