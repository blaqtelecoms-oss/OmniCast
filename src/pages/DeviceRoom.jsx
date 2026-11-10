import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { MonitorSmartphone, PhoneOff, MousePointerClick, MessageSquare } from 'lucide-react';
import { pageItems, safeSubscribe } from '@/components/room/signal';
import useViewer from '@/components/room/useViewer';
import ControlCapture from '@/components/room/ControlCapture';
import PairingPin from '@/components/room/PairingPin';
import ChatPanel from '@/components/room/ChatPanel';
import DeviceReadiness from '@/components/devices/DeviceReadiness';
import FullscreenButton from '@/components/devices/FullscreenButton';

const ONLINE_WINDOW = 150 * 1000;

export default function DeviceRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState(null);
  const [record, setRecord] = useState(null);
  const [session, setSession] = useState(null);
  const [agent, setAgent] = useState(null);
  const [notice, setNotice] = useState('');
  const [showChat, setShowChat] = useState(false);
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const rootRef = useRef(null);
  const { stream, status, sendOverChannel } = useViewer({ sessionId: session?.id || null });

  useEffect(() => {
    let alive = true;
    (async () => {
      const user = await base44.auth.me();
      const found = await base44.entities.DeviceSession.get(id).catch(() => null);
      if (!alive || !found) {
        setNotice('That session is no longer available.');
        return;
      }
      setMe(user);
      setRecord(found);
      const devices = await pageItems(
        base44.entities.DeviceAgent.filter({ device_id: found.device_id }, { limit: 1 })
      );
      if (!alive) return;
      setAgent(devices[0] || null);
      const cast = await pageItems(
        base44.entities.CastSession.filter({ code: found.code }, { sort: '-created_date', limit: 1 })
      );
      if (!alive) return;
      if (!cast[0]) setNotice('That session has ended.');
      else setSession(cast[0]);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    if (!record?.id) return;
    const unsubscribe = safeSubscribe(base44.entities.DeviceSession, (event) => {
      if (event?.data?.id === record.id) setRecord(event.data);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [record?.id]);

  // The companion reports whether it can apply input at all, so a blocked computer
  // is named here instead of the operator discovering it by clicking into nothing.
  useEffect(() => {
    if (!record?.device_id) return;
    const timer = setInterval(async () => {
      const devices = await pageItems(
        base44.entities.DeviceAgent.filter({ device_id: record.device_id }, { limit: 1 })
      ).catch(() => []);
      if (devices[0]) setAgent(devices[0]);
    }, 15000);
    return () => clearInterval(timer);
  }, [record?.device_id]);

  const seen = agent?.last_seen ? new Date(agent.last_seen).getTime() : 0;
  const readiness = Date.now() - seen < ONLINE_WINDOW && agent?.readiness ? agent.readiness : 'unknown';
  const blocked = readiness === 'needs-permission' || readiness === 'unsupported';

  const acting = record?.status === 'active';
  const controlling = acting && record?.control_holder === 'operator';

  const takeControl = async () => {
    await base44.entities.DeviceSession.update(record.id, { control_holder: 'operator' });
    setRecord({ ...record, control_holder: 'operator' });
  };

  const release = async () => {
    await base44.entities.DeviceSession.update(record.id, { control_holder: 'owner' });
    setRecord({ ...record, control_holder: 'owner' });
  };

  const end = async () => {
    await base44.functions.invoke('deviceService', { action: 'end', device_session_id: record.id });
    navigate('/devices');
  };

  return (
    <div ref={rootRef} className="flex min-h-screen w-full flex-col bg-[#040507]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground">
            <MonitorSmartphone className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-[13px] font-medium text-foreground">{record?.device_label || 'Device'}</p>
            <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
              {record?.device_id || '—'} · {record?.kind === 'unattended' ? 'unattended' : 'approved'}
            </p>
            {agent && (
              <div className="mt-1">
                <DeviceReadiness device={{ readiness, readiness_note: agent.readiness_note }} compact />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {acting && (
            <button
              type="button"
              onClick={controlling ? release : takeControl}
              disabled={blocked && !controlling}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                controlling
                  ? 'border border-primary/50 bg-primary/10 text-foreground'
                  : 'border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
              {controlling ? 'Release control' : 'Take control'}
            </button>
          )}
          <FullscreenButton targetRef={rootRef} />
          <button
            type="button"
            onClick={() => setShowChat((value) => !value)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Chat"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={end}
            className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[11.5px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            End
          </button>
        </div>
      </header>

      <div ref={stageRef} className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-contain ${stream ? '' : 'hidden'}`}
        />

        {controlling && stream && !blocked && (
          <ControlCapture
            sessionId={session?.id}
            stageRef={stageRef}
            videoRef={videoRef}
            role="guest"
            onPoint={(point) => sendOverChannel({ t: 'overlay', ...point })}
            onInput={(input) => sendOverChannel({ t: 'control', ...input })}
          />
        )}

        {!stream &&
          (record?.status === 'pending' ? (
            <PairingPin
              record={record}
              onVerified={() =>
                setRecord((current) =>
                  current ? { ...current, status: 'active', control_holder: 'operator' } : current
                )
              }
              onCancel={end}
            />
          ) : (
            <div className="max-w-md px-6 text-center">
              <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/60">
                <MonitorSmartphone className="h-6 w-6 text-muted-foreground" />
              </span>
              <p className="text-xl font-medium tracking-tight">Waiting for their screen</p>
              <p className="mx-auto mt-2 max-w-[36ch] text-[13px] leading-relaxed text-muted-foreground">
                {status === 'connecting'
                  ? 'Connecting to the screen they shared with you…'
                  : 'Their screen appears here as soon as they share it. If you are already approved you can still take control and type.'}
              </p>
              <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {notice || `Room ${record?.code || ''}`}
              </p>
            </div>
          ))}
      </div>

      <footer className="border-t border-border/70 px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 text-[12px] text-muted-foreground">
          <span>
            {blocked
              ? agent?.readiness_note || 'Control is blocked on that computer until its permission is fixed.'
              : controlling
                ? 'You control this computer — clicks and keys are applied by its companion.'
                : acting
                  ? 'You are watching. Take control to type and click.'
                  : 'Waiting for the PIN from that computer before anything is shared.'}
          </span>
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em]">
            {record?.operator_name || me?.full_name || ''}
          </span>
        </div>
        {showChat && (
          <div className="mx-auto mt-3 max-w-4xl">
            <ChatPanel sessionId={session?.id} me={me} compact />
          </div>
        )}
      </footer>
    </div>
  );
}