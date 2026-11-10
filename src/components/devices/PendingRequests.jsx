import { KeyRound, ShieldAlert } from 'lucide-react';

/**
 * A waiting connection on the owner's own screen. The six digits shown beside it are
 * the only way in, so this panel reports them and offers no shortcut past them.
 */
export default function PendingRequests({ requests, pairing, onAnswer }) {
  if (!requests.length) return null;

  return (
    <div className="space-y-2">
      {requests.map((request) => {
        const pin = pairing && pairing.sessionId === request.id ? pairing.pin : '';
        return (
          <div
            key={request.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3"
          >
            <div>
              <p className="flex items-center gap-2 text-[12.5px] text-foreground">
                <ShieldAlert className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  <span className="font-medium">{request.operator_name || 'Someone'}</span> wants control of{' '}
                  {request.device_label || 'this computer'}.
                </span>
              </p>
              {pin ? (
                <p className="mt-1.5 flex items-center gap-2 pl-6 text-[11.5px] text-muted-foreground">
                  <KeyRound className="h-3.5 w-3.5 text-primary" />
                  Pairing PIN
                  <span className="font-mono text-[15px] tracking-[0.32em] text-foreground">{pin}</span>
                  <span>— they type it on their phone.</span>
                </p>
              ) : (
                <p className="mt-1.5 pl-6 text-[11.5px] text-muted-foreground">
                  The PIN is displayed in the OmniCast window on this computer.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onAnswer(request, false)}
              className="rounded-full border border-border px-3.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
            >
              Decline
            </button>
          </div>
        );
      })}
    </div>
  );
}
