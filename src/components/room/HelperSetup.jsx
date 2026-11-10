import { useState } from 'react';
import { Download, Loader2, ShieldCheck, X } from 'lucide-react';
import { appParams } from '@/lib/app-params';
import {
  buildHelperInstaller,
  detectPlatform,
  downloadText,
  helperFileName,
} from '@/lib/deviceInstallers';

export default function HelperSetup({ session, helper }) {
  const origin = (appParams.appBaseUrl || window.location.origin).replace(/\/+$/, '');
  const device = helper.device;

  const [consent, setConsent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const platform = detectPlatform();

  const allow = async () => {
    setBusy(true);
    setError('');
    try {
      await helper.start();
      setConsent('yes');
    } catch (err) {
      setError('The pairing could not be created. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    setError('');
    try {
      const text = buildHelperInstaller(platform, { origin, token: device.token });
      downloadText(helperFileName(platform), text);
    } catch (err) {
      setError('The file could not be built. Try again.');
    }
  };

  if (!device) {
    if (consent === 'yes') {
      return (
        <p className="mt-3 flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Preparing this computer…
        </p>
      );
    }

    if (consent === 'no') {
      return (
        <div className="mt-3 rounded-xl border border-border bg-secondary/40 px-3 py-2">
          <p className="text-[11.5px] text-muted-foreground">
            Device control stays off on this computer.
          </p>
          <button
            type="button"
            onClick={() => setConsent(null)}
            className="mt-1 text-[11.5px] text-primary"
          >
            Allow it instead
          </button>
        </div>
      );
    }

    return (
      <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
        <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <ShieldCheck className="h-4 w-4 text-accent" />
          Allow control on this computer?
        </p>
        <ul className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-muted-foreground">
          <li>· We set up a one-time pairing for room {session?.code} for you.</li>
          <li>· Input only happens while control is handed to the other person.</li>
          <li>· Revoke access or press Ctrl+C and it stops instantly.</li>
        </ul>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={allow}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            Allow control
          </button>
          <button
            type="button"
            onClick={() => setConsent('no')}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Not now
          </button>
        </div>
        {error && <p className="mt-2 text-[11.5px] text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-background/60 p-3">
      <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        <Download className="h-4 w-4 text-accent" />
        One file, already set up
      </p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
        It carries room {session?.code} and a pairing token that only works for this session, so
        there is nothing to paste and nothing to type. Open it once on the computer being
        controlled and leave it running.
      </p>

      <button
        type="button"
        onClick={download}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        <Download className="h-3.5 w-3.5" />
        Download and open this file
      </button>

      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/80">
        Double-click the download — it sets everything up by itself. The token stops working the
        moment you revoke access or end the session.
      </p>

      {error && <p className="mt-2 text-[11.5px] text-destructive">{error}</p>}
    </div>
  );
}