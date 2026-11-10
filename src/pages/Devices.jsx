import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, MonitorSmartphone, Plus } from 'lucide-react';
import useDevices from '@/components/devices/useDevices';
import ThisDeviceCard from '@/components/devices/ThisDeviceCard';
import UnpairedCompanion from '@/components/devices/UnpairedCompanion';
import DeviceCard from '@/components/devices/DeviceCard';
import InstallCompanion from '@/components/devices/InstallCompanion';
import ConnectDeviceCard from '@/components/devices/ConnectDeviceCard';
import PendingRequests from '@/components/devices/PendingRequests';
import SharePublisher from '@/components/devices/SharePublisher';
import { detectPlatform } from '@/lib/deviceInstallers';
import openLocalScreen from '@/lib/localScreen';
import { toast } from '@/components/ui/toaster';

export default function Devices() {
  const navigate = useNavigate();
  const devices = useDevices();
  const [stream, setStream] = useState(null);
  const [notice, setNotice] = useState('');
  const [starting, setStarting] = useState(false);
  const skipNative = useRef(false);
  const [agentToken] = useState(() => new URLSearchParams(window.location.search).get('agent') || '');
  const platform = detectPlatform();

  const toggleShare = async () => {
    setNotice('');
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      return;
    }
    if (starting) return;
    setStarting(true);
    try {
      const native = devices.runningHere?.capture && !skipNative.current ? await openLocalScreen(devices.runningHere.port) : null;
      if (!native) skipNative.current = true;
      const next = native || (await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } }));
      next.getVideoTracks()[0]?.addEventListener('ended', () => setStream(null));
      setStream(next);
    } catch (err) {
      setNotice('Screen sharing was cancelled or blocked.');
    } finally {
      setStarting(false);
    }
  };

  const approve = async (id) => {
    await devices.approve(id);
    toast({ title: 'Computer paired', description: 'It can now join your sessions.' });
  };

  const decline = async (id) => {
    await devices.decline(id);
    toast({ title: 'Request declined' });
  };

  const remove = async (id) => {
    await devices.remove(id);
    toast({ title: 'Computer removed' });
  };

  const pair = async (payload) => {
    const device = await devices.pair(payload);
    toast({
      title: 'Pairing request created',
      description: `${device.name} is waiting for your approval.`,
    });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="max-w-2xl">
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary">Devices</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">Every computer, one flat list.</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Share straight from this browser, or pair the machines you use often so they are one code away.
        </p>
      </header>

      {devices.error ? (
        <p className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {devices.error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-5">
          <ThisDeviceCard
            stream={stream}
            starting={starting}
            onToggle={toggleShare}
            platform={platform}
            notice={notice}
          />

          <section>
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                Paired computers
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {devices.loading ? '…' : devices.devices.length}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {devices.loading ? (
                <div className="flex items-center justify-center rounded-xl border border-border/70 py-10 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : devices.devices.length ? (
                devices.devices.map((device) => (
                  <DeviceCard key={device.id} device={device} onRemove={remove} />
                ))
              ) : (
                <div className="rounded-xl border border-border/70 bg-card/30 px-5 py-8 text-center">
                  <Plus className="mx-auto h-4 w-4 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">No computers paired yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Run the installer on a machine, then add its code below.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4">
              <ConnectDeviceCard onPair={pair} />
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <PendingRequests requests={devices.pending} onApprove={approve} onDecline={decline} />
          <UnpairedCompanion platform={platform} />
          <SharePublisher hasStream={Boolean(stream)} />
          <InstallCompanion platform={platform} token={agentToken} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/join')}
        className="focus-ring mt-8 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Watching instead of sharing? Join with a code.
      </button>
    </div>
  );
}
