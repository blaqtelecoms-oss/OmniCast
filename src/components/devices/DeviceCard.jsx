import { Link } from 'react-router-dom';
import { Check, ChevronRight, Monitor, Trash2 } from 'lucide-react';
import { PLATFORMS } from '@/lib/deviceInstallers';
import { formatRelative } from '@/lib/utils';

export default function DeviceCard({ device, onRemove }) {
  const platform = PLATFORMS.find((entry) => entry.id === device.platform);
  const online = device.status === 'paired';

  return (
    <div className="group flex items-center gap-4 rounded-xl border border-border/80 bg-card/50 p-4 transition-colors hover:border-border hover:bg-card">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
        <Monitor className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{device.name}</p>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] ${
              online ? 'bg-accent/12 text-accent' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {online ? <Check className="h-2.5 w-2.5" /> : null}
            {online ? 'paired' : 'offline'}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {platform?.name || 'Unknown platform'}
          {platform?.shell ? ` · ${platform.shell}` : ''} · seen {formatRelative(device.lastSeen)}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onRemove(device.id)}
          className="focus-ring rounded-full p-2 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`Remove ${device.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <Link
          to={`/device/${device.id}`}
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={`Open ${device.name}`}
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
