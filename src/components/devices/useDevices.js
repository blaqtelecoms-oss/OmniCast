import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { pageItems, safeSubscribe } from '@/components/room/signal';
import { randomDeviceCode, randomPairSecret } from '@/lib/deviceInstallers';
import { findLocalDevice } from '@/lib/localAgent';
import { appParams } from '@/lib/app-params';

const LOCAL_KEY = 'omnicast-device-record';
const ONLINE_WINDOW = 150 * 1000;

const defaultLabel = (platform) => {
  const host = (navigator.userAgent.match(/\(([^)]+)\)/) || [])[1] || '';
  const kind = platform === 'macos' ? 'Mac' : platform === 'windows' ? 'PC' : 'Workstation';
  const variant = host.split(';')[0]?.trim();
  return variant && variant.length < 28 ? `${kind} · ${variant}` : kind;
};

const withPresence = (device) => {
  const seen = device.last_seen ? new Date(device.last_seen).getTime() : 0;
  const fresh = Date.now() - seen < ONLINE_WINDOW;
  const status = device.status === 'revoked' ? 'revoked' : fresh ? 'online' : device.status === 'pairing' ? 'pairing' : 'offline';
  const minutes = Math.round((Date.now() - seen) / 60000);
  return {
    ...device,
    status,
    // A stale report says nothing: only a fresh heartbeat can claim readiness.
    readiness: fresh && device.readiness ? device.readiness : 'unknown',
    readiness_note: fresh ? device.readiness_note || '' : '',
    last_seen_hint: fresh
      ? 'Active now'
      : seen
        ? minutes < 60
          ? `Last seen ${minutes} min ago`
          : `Last seen ${Math.round(minutes / 60)} h ago`
        : 'Never connected',
  };
};

/**
 * Which record is "this computer". When the companion answers on this machine it is
 * the authority: its own record, or none at all when that record belongs to another
 * account. A leftover record from an older download must never lend its number here,
 * because that number is not the one this computer actually answers to.
 */
const resolveThisDevice = (devices, runningHere, localDeviceId, me) => {
  if (runningHere) return devices.find((item) => item.id === runningHere.recordId) || null;
  return (
    devices.find((item) => item.id === localDeviceId) ||
    devices.find((item) => item.id === me?.omnicast_device_id) ||
    null
  );
};

export default function useDevices() {
  const [me, setMe] = useState(null);
  const [devices, setDevices] = useState([]);
  const [requests, setRequests] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(true);
  // What the companion on this computer says it is, even when that device is not
  // in this account's list (removed, or set up under another account).
  const [runningHere, setRunningHere] = useState(null);
  // Which device record belongs to the computer this browser runs on. Remembered
  // per browser, and re-discovered from the companion that is installed here.
  const [localDeviceId, setLocalDeviceId] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('device') || '';
    if (fromUrl) localStorage.setItem(LOCAL_KEY, fromUrl);
    return fromUrl || localStorage.getItem(LOCAL_KEY) || '';
  });
  const localRef = useRef(localDeviceId);
  localRef.current = localDeviceId;
  const savedRef = useRef('');
  // The companion's own answer about this computer, and the latest device list, held
  // in refs so a refresh can settle on the right record without stale closures.
  const runningRef = useRef(null);
  const devicesRef = useRef([]);
  // Whether anything is waiting for a PIN right now, read by the local companion poll.
  const waitingRef = useRef(0);

  // Which device record belongs to this computer is remembered on the account as
  // well as in the browser, so the number is still there after a fresh sign-in,
  // in another browser, or when this browser's storage was cleared.
  const remember = (id) => {
    if (!id) return;
    localStorage.setItem(LOCAL_KEY, id);
    setLocalDeviceId(id);
    if (savedRef.current === id) return;
    savedRef.current = id;
    base44.auth.updateMe({ omnicast_device_id: id }).catch(() => {});
  };

  const load = async (user) => {
    const list = await pageItems(
      base44.entities.DeviceAgent.filter({ created_by_id: user.id }, { sort: '-created_date', limit: 100 })
    );
    const mine = list.map(withPresence);
    devicesRef.current = mine;
    setDevices(mine);

    if (!mine.length) {
      waitingRef.current = 0;
      setRequests([]);
      setActive(null);
      return;
    }

    const ids = mine.map((item) => item.device_id);
    const sessions = await pageItems(
      base44.entities.DeviceSession.filter(
        { device_id: { $in: ids }, status: { $in: ['pending', 'active'] } },
        { sort: '-created_date', limit: 20 }
      )
    );
    const waiting = sessions.filter((item) => item.status === 'pending');
    waitingRef.current = waiting.length;
    setRequests(waiting);

    // The companion running here is the authority on which record this computer is —
    // it reports the ID it actually paired as. Only without a companion does the
    // record remembered in this browser (or saved on the account) decide.
    const here = runningRef.current?.recordId;
    let local = (here && mine.find((item) => item.id === here)) || mine.find((item) => item.id === localRef.current);
    if (!local && user.omnicast_device_id) {
      local = mine.find((item) => item.id === user.omnicast_device_id);
      if (local) remember(local.id);
    } else if (local && local.id !== localRef.current) {
      remember(local.id);
    }
    setActive(sessions.find((item) => item.status === 'active' && item.device_id === local?.device_id) || null);
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const user = await base44.auth.me();
        if (!alive) return;
        setMe(user);
        await load(user);
      } catch (err) {
        if (alive) setDevices([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const unsubscribe = safeSubscribe(base44.entities.DeviceAgent, () => {
      if (me) load(me).catch(() => {});
    });
    const stopSessions = safeSubscribe(base44.entities.DeviceSession, () => {
      if (me) load(me).catch(() => {});
    });
    const timer = setInterval(() => {
      if (me) load(me).catch(() => {});
    }, 12000);

    return () => {
      alive = false;
      clearInterval(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
      if (typeof stopSessions === 'function') stopSessions();
    };
  }, [me?.id]);

  useEffect(() => {
    if (localRef.current) remember(localRef.current);
    let alive = true;
    const ask = (first) => {
      findLocalDevice()
        .then((found) => {
          if (!alive || !found) return;
          runningRef.current = found;
          setRunningHere(found);
          // The companion knows which device it paired as, so show that one even when
          // this browser still remembers an older pairing record for this computer.
          if (first && found.recordId && devicesRef.current.some((item) => item.id === found.recordId)) {
            remember(found.recordId);
          }
        })
        .catch(() => {});
    };

    ask(true);
    // While a connection waits, the companion puts a six-digit PIN on this computer.
    // Reading it again keeps those digits on this screen, not only in its window —
    // and only while something is actually waiting.
    const timer = setInterval(() => {
      if (waitingRef.current) ask(false);
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const createDevice = async (platform) => {
    // A new download keeps the number this computer already shows, unless another
    // device in the app holds it.
    const shown = /^\d{9}$/.test(runningHere?.deviceId || '') ? runningHere.deviceId : '';
    if (shown) {
      const held = await pageItems(
        base44.entities.DeviceAgent.filter({ device_id: shown }, { limit: 1 })
      ).catch(() => []);
      // Same computer, same number: the record it already has is re-armed with a new
      // pairing secret, so the download never hands this computer a second number.
      if (held.length) {
        const pairSecret = randomPairSecret();
        const again = await base44.entities.DeviceAgent.update(held[0].id, {
          pair_secret: pairSecret,
          status: 'pairing',
        });
        localStorage.setItem(LOCAL_KEY, again.id);
        setLocalDeviceId(again.id);
        if (me) await load(me);
        return {
          origin: appParams.appBaseUrl || window.location.origin,
          api: appParams.backendUrl,
          deviceCode: again.id,
          pairSecret,
        };
      }
    }
    const number = shown || randomDeviceCode();
    // Every download gets its own pairing record and secret, so the file that was
    // actually saved on the computer is always the one that can pair.
    const record = await base44.entities.DeviceAgent.create({
      device_id: number,
      label: defaultLabel(platform),
      platform,
      status: 'pairing',
      unattended_enabled: false,
      allow_pointer: true,
      allow_keyboard: true,
      allow_clipboard: false,
      pair_secret: randomPairSecret(),
      version: '1.0.0',
    });
    localStorage.setItem(LOCAL_KEY, record.id);
    setLocalDeviceId(record.id);
    if (me) await load(me);
    return {
      origin: appParams.appBaseUrl || window.location.origin,
      api: appParams.backendUrl,
      deviceCode: record.id,
      pairSecret: record.pair_secret,
    };
  };

  /**
   * Adds the companion already running on this computer to this account, keeping
   * the number it shows. Only a page the companion opened carries `agentToken`,
   * which is what the companion accepts as proof the pairing was asked for here.
   */
  const pairThisComputer = async (agentToken) => {
    const here = runningHere;
    if (!here?.port) {
      return 'No companion answered on this computer. Start OmniCast here, then press the button again.';
    }
    // The companion answers /adopt only for the token it minted when it started, so
    // the fresh one it just reported wins over a token left in an older page's URL.
    const token = here.token || agentToken;
    if (!token) {
      return 'The copy of OmniCast running on this computer is older than this page, so it cannot be added from here. Restart OmniCast on this computer (or download it again below), then press this button.';
    }
    const claim = await base44.functions.invoke('deviceService', {
      action: 'claim',
      device_id: here.deviceId,
      label: here.label || defaultLabel(here.platform),
      platform: here.platform || 'windows',
    });
    const claimData = claim.data || {};
    if (claimData.error || !claimData.record_id) {
      return claimData.error || 'This computer could not be added. Please try again.';
    }

    let adopted = null;
    try {
      const res = await fetch(`http://127.0.0.1:${here.port}/adopt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          record_id: claimData.record_id,
          pair_secret: claimData.pair_secret,
        }),
        signal: AbortSignal.timeout(15000),
      });
      adopted = res.ok ? await res.json().catch(() => null) : null;
    } catch (err) {
      adopted = null;
    }

    if (!adopted?.device_id) {
      // Nothing took the record, so it must not linger as a dead device.
      await base44.entities.DeviceAgent.delete(claimData.record_id).catch(() => {});
      return 'This computer did not accept the pairing. Restart OmniCast here and press the button again.';
    }

    remember(claimData.record_id);
    // Downloads that were never opened leave records with numbers no computer
    // answers to. Now that this computer is paired, they are only clutter.
    const stale = devicesRef.current.filter(
      (item) =>
        item.id !== claimData.record_id &&
        item.status === 'pairing' &&
        !item.secret_hash &&
        Date.now() - new Date(item.created_date).getTime() > 10 * 60 * 1000
    );
    if (stale.length) {
      await base44.entities.DeviceAgent.deleteMany({ id: { $in: stale.map((item) => item.id) } }).catch(() => {});
    }
    const found = await findLocalDevice().catch(() => null);
    if (found) {
      runningRef.current = found;
      setRunningHere(found);
    }
    if (me) await load(me);
    return '';
  };

  const saveUnattended = async (device, payload) => {
    const res = await base44.functions.invoke('deviceService', {
      action: 'set-unattended',
      device_id: device.device_id,
      ...payload,
    });
    if (res.data?.error) return res.data.error;
    if (me) await load(me);
    return '';
  };

  // `code` is the help code the owner of another computer made. From the request
  // onwards — the PIN, control, ending — everything is the same flow as a device
  // in your own list.
  const connect = async ({ deviceId, password, code }) => {
    const res = await base44.functions.invoke(
      'deviceService',
      code
        ? { action: 'connect', support_code: code }
        : { action: 'connect', device_id: deviceId, password }
    );
    const data = res.data || {};
    if (data.error) return data.error;
    if (!data.device_session_id) return 'The connection was not confirmed. Please try again.';
    return data;
  };

  const answer = async (request, accept) => {
    await base44.functions.invoke('deviceService', {
      action: 'answer',
      device_session_id: request.id,
      accept,
    });
    if (me) await load(me);
  };

  const endSession = async (sessionRecord) => {
    await base44.functions.invoke('deviceService', {
      action: 'end',
      device_session_id: sessionRecord.id,
    });
    if (me) await load(me);
  };

  const removeDevice = async (device) => {
    await base44.entities.DeviceAgent.delete(device.id);
    if (device.id === localRef.current) {
      localStorage.removeItem(LOCAL_KEY);
      setLocalDeviceId('');
    }
    if (me) await load(me);
  };

  return {
    me,
    devices,
    requests,
    active,
    loading,
    runningHere,
    thisDevice: resolveThisDevice(devices, runningHere, localDeviceId, me),
    createDevice,
    pairThisComputer,
    saveUnattended,
    connect,
    answer,
    endSession,
    removeDevice,
  };
}