import { ShieldCheck, ShieldAlert, MonitorPlay, CircleSlash, HelpCircle } from 'lucide-react';

const TONES = {
  ready: { icon: ShieldCheck, text: 'text-accent', label: 'Native control ready', short: 'Ready' },
  'input-only': { icon: MonitorPlay, text: 'text-primary', label: 'Control ready · screen from browser', short: 'Control only' },
  'needs-permission': { icon: ShieldAlert, text: 'text-destructive', label: 'Needs permission', short: 'Needs permission' },
  unsupported: { icon: CircleSlash, text: 'text-destructive', label: 'Unsupported', short: 'Unsupported' },
  unknown: { icon: HelpCircle, text: 'text-muted-foreground', label: 'Readiness unknown', short: 'Unknown' },
};

export default function DeviceReadiness({ device, compact = false }) {
  const tone = TONES[device?.readiness] || TONES.unknown;
  const Icon = tone.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${tone.text}`} title={device?.readiness_note || ''}>
      <Icon className="h-3 w-3" />
      {compact ? tone.short : tone.label}
    </span>
  );
}