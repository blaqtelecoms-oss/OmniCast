import { Check, X } from 'lucide-react';

export default function JoinRequests({ requests, onAnswer }) {
  if (!requests.length) return null;

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="absolute left-1/2 top-4 z-20 w-[min(92%,360px)] -translate-x-1/2 space-y-2 rounded-2xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur"
    >
      {requests.map((request) => (
        <div key={request.key} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{request.name} wants to join</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              Waiting for you
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => onAnswer(request.key, 'join-accept', request.name)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground"
            >
              <Check className="h-3 w-3" />
              Accept
            </button>
            <button
              type="button"
              onClick={() => onAnswer(request.key, 'join-decline', request.name)}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}