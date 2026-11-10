import { Loader2, ShieldCheck } from 'lucide-react';

export default function JoinGate({ session, status, onAskAgain }) {
  const declined = status === 'declined';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border">
        <ShieldCheck className="h-6 w-6 text-accent" />
      </span>

      <div>
        <p className="text-xl font-medium tracking-tight">
          {declined ? 'The host has not let you in' : 'Waiting for the host to accept you'}
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
          {declined
            ? 'They can let you in at any moment — ask again when you are ready.'
            : 'This help room is private. The host accepts you before your screen is shared.'}
        </p>
      </div>

      <p className="font-mono text-2xl tracking-[0.3em] text-foreground">{session.code}</p>

      {declined ? (
        <button
          type="button"
          onClick={onAskAgain}
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Ask again
        </button>
      ) : (
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Request sent
        </p>
      )}
    </div>
  );
}