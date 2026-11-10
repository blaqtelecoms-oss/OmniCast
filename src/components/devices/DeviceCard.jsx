import { useState } from 'react';
import { KeyRound, Laptop, Lock, LockOpen, ShieldOff } from 'lucide-react';
import StatusDot from './StatusDot';
import DeviceReadiness from './DeviceReadiness';
import UnattendedPanel from './UnattendedPanel';

const PLATFORM_LABEL = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

export default function DeviceCard({ device, onConnect, onRevoke, onSaveUnattended }) {
  const online = device.status === 'online';
  const [access, setAccess] = useState(false);

  return (
    <article className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card/60 p-5 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium text-foreground">{device.label}</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {PLATFORM_LABEL[device.platform] || 'Desktop'}
            {device.os_detail ? ` · ${device.os_detail}` : ''}
          </p>
        </div>
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground">
          <Laptop className="h-3.5 w-3.5" />
        </span>
      </div>

      <p className="mt-4 font-mono text-[22px] tracking-[0.18em] text-foreground">
        {device.device_id}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
        <StatusDot status={device.status} />
        {device.status !== 'pairing' && <DeviceReadiness device={device} compact />}
        <span className="flex items-center gap-1">
          {device.unattended_enabled ? (
            <>
              <LockOpen className="h-3 w-3 text-primary" /> Unattended on
            </>
          ) : (
            <>
              <Lock className="h-3 w-3" /> Approval needed
            </>
          )}
        </span>
        {device.last_seen_hint && <span className="text-muted-foreground/70">{device.last_seen_hint}</span>}
      </div>

      {device.readiness_note && ['needs-permission', 'unsupported'].includes(device.readiness) && (
        <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {device.readiness_note}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onConnect?.(device)}
          disabled={!online}
          className="flex-1 rounded-full bg-primary py-2 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
        >
          {online ? 'Connect' : device.status === 'pairing' ? 'Awaiting setup' : 'Offline'}
        </button>
        <button
          type="button"
          onClick={() => onRevoke?.(device)}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
          aria-label="Remove device"
        >
          <ShieldOff className="h-3.5 w-3.5" />
        </button>
      </div>

      {access ? (
        <UnattendedPanel
          device={device}
          onSave={(payload) => onSaveUnattended?.(device, payload)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAccess(true)}
          className="mt-3 flex items-center gap-1.5 self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <KeyRound className="h-3 w-3" />
          {device.unattended_enabled ? 'Change unattended password' : 'Set an unattended password'}
        </button>
      )}
    </article>
  );
}