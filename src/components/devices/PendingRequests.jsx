import { ShieldAlert } from 'lucide-react';

export default function PendingRequests({ requests, onAnswer }) {
  if (!requests.length) return null;

  return (
    <div className="space-y-2">
      {requests.map((request) => (
        <div
          key={request.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3"
        >
          <p className="flex items-center gap-2 text-[12.5px] text-foreground">
            <ShieldAlert className="h-4 w-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium">{request.operator_name || 'Someone'}</span> wants control of{' '}
              {request.device_label || 'this computer'}.
            </span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAnswer(request, false)}
              className="rounded-full border border-border px-3.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => onAnswer(request, true)}
              className="rounded-full bg-primary px-3.5 py-1.5 text-[11.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Allow
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}