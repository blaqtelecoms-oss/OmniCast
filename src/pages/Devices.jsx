import { useEffect, useRef, useState } from 'react';
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
import { buildInstaller, detectPlatform, downloadText, PLATFORMS } from '@/lib/deviceInstallers';
import openLocalScreen from '@/lib/localScreen';

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

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="max-w-2xl">
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary">Devices</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">Every computer, one flat list.</h1>
      </header>
    </div>
  );
}
