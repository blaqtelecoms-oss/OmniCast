import { Loader2, MonitorSmartphone, ShieldCheck, ShieldOff } from 'lucide-react';
import HelperSetup from './HelperSetup';

export default function HelperPanel({ session, helper }) {
  const device = helper?.device;
  const live = Boolean(helper?.connected);
  const revoked = device?.status === 'revoked';

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            Device control
          </p>
          <p className="mt-1 flex items-center gap-2 text-[13.5px] font-medium text-foreground">
            {live ? (
              <ShieldCheck className="h-4 w-4 text-accent" />
            ) : revoked ? (
              <ShieldOff className="h-4 w-4 text-destructive" />
            ) : (
              <MonitorSmartphone className="h-4 w-4 text-accent" />
            )}
            {live ? 'Helper connected' : revoked ? 'Access revoked' : 'Real control needs the helper'}
          </p>
        </div>
        {live && helper.isOwnerSide && (
          <button
            type="button"
            onClick={helper.revoke}
            className="shrink-0 rounded-full border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
          >
            Revoke access
          </button>
        )}
      </div>

      {!device && (
        <>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            A browser cannot press keys on another computer. Open the OmniCast file on the machine
            you want controlled — it sets itself up — and then whoever holds control can really type
            and click on it.
          </p>
          {helper.isOwnerSide ? (
            <HelperSetup session={session} helper={helper} />
          ) : (
            <p className="mt-3 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-[11.5px] text-muted-foreground">
              Waiting for the other person to prepare their computer.
            </p>
          )}
        </>
      )}

      {device && !live && !revoked && <HelperSetup session={session} helper={helper} />}

      {revoked && (
        <>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            The helper stopped accepting input. Nothing on this computer can be controlled right now.
          </p>
          {helper.isOwnerSide && (
            <button
              type="button"
              onClick={helper.start}
              className="mt-3 w-full rounded-xl border border-border py-2 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Start a new pairing
            </button>
          )}
        </>
      )}

      {live && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {helper.isOwnerSide
              ? device.control_holder === device.owner_role
                ? 'You have control. Switch to “They control” to let them type and click here.'
                : 'They have real control of this computer. Revoke access at any time.'
              : device.control_holder === helper.myRole
                ? 'You have control — click the shared screen and start typing.'
                : 'You can watch, point and leave notes. Take control to type and click.'}
          </p>
        </div>
      )}

      {device && (
        <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground/70">
          Share the whole screen so their clicks land where they point. Room {session?.code} ·
          paired {device.label || 'computer'}
        </p>
      )}

      {device && !live && !revoked && (
        <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
          Waiting for the helper to connect
        </p>
      )}
    </div>
  );
}