import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { pageItems, safeSubscribe } from './signal';

const randomToken = () =>
  (crypto.randomUUID?.() || `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/-/g, '');

const ageOf = (record) => Date.now() - new Date(record?.created_date || 0).getTime();

export default function useHelper(session, me, isOwnerSide) {
  const [device, setDevice] = useState(null);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const myRole = session?.host_id === me?.id ? 'host' : 'guest';

  useEffect(() => {
    if (!session?.id) return;
    let stopped = false;

    const load = async () => {
      try {
        const [devices, pings] = await Promise.all([
          pageItems(
            base44.entities.HelperDevice.filter(
              { session_id: session.id },
              { sort: '-created_date', limit: 3 }
            )
          ),
          pageItems(
            base44.entities.HelperPing.filter(
              { session_id: session.id },
              { sort: '-created_date', limit: 1 }
            )
          ),
        ]);
        if (stopped) return;
        setDevice(devices[0] || null);
        setConnected(Boolean(pings[0]) && ageOf(pings[0]) < 20000);
        setReady(true);
      } catch (err) {
        if (!stopped) setReady(true);
      }
    };

    load();
    const timer = setInterval(load, 3000);
    const stopDevices = safeSubscribe(base44.entities.HelperDevice, () => load());
    const stopPings = safeSubscribe(base44.entities.HelperPing, () => load());

    return () => {
      stopped = true;
      clearInterval(timer);
      if (typeof stopDevices === 'function') stopDevices();
      if (typeof stopPings === 'function') stopPings();
    };
  }, [session?.id]);

  const patch = async (data) => {
    if (!device) return;
    setDevice({ ...device, ...data });
    await base44.entities.HelperDevice.update(device.id, data);
  };

  const start = async () => {
    const created = await base44.entities.HelperDevice.create({
      session_id: session.id,
      token: randomToken(),
      owner_role: myRole,
      control_holder: myRole,
      status: 'waiting',
      label: navigator.platform || 'This computer',
      platform: 'desktop',
    });
    setDevice(created);
    setConnected(false);
  };

  return {
    device,
    connected,
    ready,
    myRole,
    isOwnerSide,
    canPair: isOwnerSide && !device,
    start,
    revoke: () => patch({ status: 'revoked' }),
    setControlHolder: (role) => patch({ control_holder: role === 'guest' ? 'guest' : 'host' }),
  };
}