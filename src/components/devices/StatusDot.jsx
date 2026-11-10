const TONES = {
  online: { dot: 'bg-accent', text: 'text-accent', label: 'Online' },
  offline: { dot: 'bg-muted-foreground/50', text: 'text-muted-foreground', label: 'Offline' },
  pairing: { dot: 'bg-primary', text: 'text-primary', label: 'Pairing' },
  waiting: { dot: 'bg-primary', text: 'text-primary', label: 'Waiting for approval' },
  revoked: { dot: 'bg-destructive', text: 'text-destructive', label: 'Access revoked' },
};

export default function StatusDot({ status }) {
  const tone = TONES[status] || TONES.offline;
  const pulsing = status === 'online' || status === 'waiting' || status === 'pairing';

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${tone.text}`}>
      <span className="relative flex h-1.5 w-1.5">
        {pulsing && (
          <span className={`absolute inset-0 animate-ping rounded-full ${tone.dot} opacity-60`} />
        )}
        <span className={`relative h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      </span>
      {tone.label}
    </span>
  );
}