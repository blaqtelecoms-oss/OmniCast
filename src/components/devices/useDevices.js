import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const REFRESH_MS = 15000;

export default function useDevices() {
  const [state, setState] = useState({ devices: [], pending: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await base44.devices.list();
      if (!alive.current) return;
      setState({ devices: data.devices || [], pending: data.pending || [] });
      setError('');
    } catch (err) {
      if (alive.current) setError(err.message || 'Devices could not be loaded.');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh().finally(() => {
      if (alive.current) setLoading(false);
    });
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const pair = useCallback(
    async (payload) => {
      const device = await base44.devices.pair(payload);
      await refresh();
      return device;
    },
    [refresh]
  );

  const approve = useCallback(
    async (id) => {
      await base44.devices.approve(id);
      await refresh();
    },
    [refresh]
  );

  const decline = useCallback(
    async (id) => {
      await base44.devices.decline(id);
      await refresh();
    },
    [refresh]
  );

  const rename = useCallback(
    async (id, name) => {
      await base44.devices.update(id, { name });
      await refresh();
    },
    [refresh]
  );

  const remove = useCallback(
    async (id) => {
      await base44.devices.remove(id);
      await refresh();
    },
    [refresh]
  );

  return {
    devices: state.devices,
    pending: state.pending,
    runningHere: null,
    loading,
    error,
    refresh,
    pair,
    approve,
    decline,
    rename,
    remove,
  };
}
