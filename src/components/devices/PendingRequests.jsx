import { Check, X } from 'lucide-react';
import { formatRelative } from '@/lib/utils';

export default function PendingRequests({ requests, onApprove, onDecline }) {
  if (!requests.length) return null;

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/[0.06] p-5">
      <div className="flex items-center justify-between">
        <p className="label-micro text-primary">Waiting for you</p>
        <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
          {requests.length}
        </span>
      </div>

      <ul className="mt-4 space-y-2">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{request.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Asked {formatRelative(request.requestedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onDecline(request.id)}
                className="focus-ring flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3 w-3" /> Decline
              </button>
              <button
                type="button"
                onClick={() => onApprove(request.id)}
                className="focus-ring flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
              >
                <Check className="h-3 w-3" /> Approve
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
