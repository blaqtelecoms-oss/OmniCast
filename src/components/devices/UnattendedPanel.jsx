import { useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';

const PERMISSIONS = [
  { key: 'allow_pointer', label: 'Mouse and clicks' },
  { key: 'allow_keyboard', label: 'Keyboard' },
  { key: 'allow_clipboard', label: 'Clipboard' },
];

export default function UnattendedPanel({ device, onSave }) {
  const [enabled, setEnabled] = useState(device.unattended_enabled);
  const [password, setPassword] = useState('');
  const [perms, setPerms] = useState({
    allow_pointer: device.allow_pointer !== false,
    allow_keyboard: device.allow_keyboard !== false,
    allow_clipboard: Boolean(device.allow_clipboard),
  });
  const [status, setStatus] = useState('');
  const online = device.status === 'online';

  const save = async (nextEnabled) => {
    setStatus('');
    const problem = await onSave({
      enabled: nextEnabled,
      password: password || undefined,
      ...perms,
    });
    if (problem) {
      setStatus(problem);
      return;
    }
    setEnabled(nextEnabled);
    setPassword('');
    setStatus(nextEnabled ? 'Unattended access is on.' : 'Unattended access is off.');
  };

  return (
    <div className="mt-5 border-t border-border/70 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-foreground">
            {enabled ? (
              <LockOpen className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            Unattended access
          </p>
          <p className="mt-1 max-w-[42ch] text-[11.5px] leading-relaxed text-muted-foreground">
            {enabled
              ? 'Someone with the device ID and this password can connect without anyone at the keyboard.'
              : 'Off. Every connection needs someone at this computer to approve it.'}
          </p>
        </div>
        <span
          className={`mt-1 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            enabled ? 'bg-primary' : 'bg-secondary'
          }`}
        >
          <span
            className={`h-4 w-4 rounded-full bg-background transition-transform ${
              enabled ? 'translate-x-4' : ''
            }`}
          />
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {PERMISSIONS.map((permission) => (
          <button
            key={permission.key}
            type="button"
            onClick={() => setPerms((prev) => ({ ...prev, [permission.key]: !prev[permission.key] }))}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              perms[permission.key]
                ? 'border-accent/40 bg-accent/10 text-foreground'
                : 'border-border text-muted-foreground'
            }`}
          >
            {permission.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="new-password"
          placeholder={enabled ? 'New unattended password' : 'Set a password to turn it on'}
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/50"
        />
        <button
          type="button"
          onClick={() => save(true)}
          disabled={!online || (!password && !enabled)}
          className="shrink-0 rounded-xl bg-primary px-3 py-2 text-[11.5px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-secondary disabled:text-muted-foreground"
        >
          {enabled ? 'Update' : 'Turn on'}
        </button>
        {enabled && (
          <button
            type="button"
            onClick={() => save(false)}
            className="shrink-0 rounded-xl border border-border px-3 py-2 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Off
          </button>
        )}
      </div>

      <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground/70">
        {online
          ? 'Changes are accepted only while the companion is running on that computer.'
          : 'The companion is not running on that computer right now, so changes are paused.'}
        {status ? ` ${status}` : ''}
      </p>
    </div>
  );
}