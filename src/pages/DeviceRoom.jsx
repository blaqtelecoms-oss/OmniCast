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
      // Nothing here depends on anything else here, and every ask costs a round
      // trip: done one after another they are the waiting before the picture shows.
      const [user, found] = await Promise.all([
        base44.auth.me().catch(() => null),
        base44.entities.DeviceSession.get(id).catch(() => null),
      ]);
      if (!alive || !found) {
        setNotice('That session is no longer available.');
        return;
      }
      setMe(user);
      setRecord(found);
      const [devices, cast] = await Promise.all([
        pageItems(base44.entities.DeviceAgent.filter({ device_id: found.device_id }, { limit: 1 })).catch(
          () => []
        ),
        pageItems(
          base44.entities.CastSession.filter({ code: found.code }, { sort: '-created_date', limit: 1 })
        ).catch(() => []),
      ]);
      if (!alive) return;
      setAgent(devices[0] || null);
      if (!cast[0]) setNotice('That session has ended.');
      else setSession(cast[0]);
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    // The element is hidden until a picture exists, and a browser can leave a video
    // that started hidden sitting on its first (empty) frame. Asking it to play when
    // the stream arrives is what turns "connected" into a visible desktop.
    if (stream) video.play().catch(() => {});
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
  // A computer that reports it cannot take input is warned about, never hidden: the
  // person driving must still be able to click and type, and be told why nothing
  // moved. Hiding the controls turned a permission problem into "it just views".
  // "input-only" also carries a note when that computer's picture cannot come from
  // its own capture — a locked desktop looks like a black screen otherwise.
  const blockedNote =
    readiness === 'needs-permission' || readiness === 'unsupported' || readiness === 'input-only'
      ? agent?.readiness_note || 'That computer is not accepting input yet.'
      : '';

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
    <div
      ref={rootRef}
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-[#040507]"
    >
      {/* The picture owns the whole screen; these bars float over it on a scrim and
          let clicks through wherever there is no control, so the desktop stays usable. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-b from-black/90 via-black/55 to-transparent px-4 pb-8 pt-3">
        <div className="pointer-events-auto flex items-center gap-3">
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
        <div className="pointer-events-auto flex items-center gap-2">
          {acting && (
            <button
              type="button"
              onClick={controlling ? release : takeControl}
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

        {controlling && (
          <ControlCapture
            sessionId={session?.id}
            stageRef={stageRef}
            videoRef={videoRef}
            role="guest"
            hintTop={96}
            controlBottom={76}
            onPoint={(point) => sendOverChannel({ t: 'overlay', ...point })}
            onInput={(input) => sendOverChannel({ t: 'control', ...input })}
          />
        )}

        {!stream &&
          !controlling &&
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

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-3 pt-8">
        <div className="pointer-events-auto mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 text-[12px] text-muted-foreground">
          <span>
            {blockedNote
              ? blockedNote
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
          <div className="pointer-events-auto mx-auto mt-3 max-h-[60vh] max-w-4xl overflow-y-auto">
            <ChatPanel sessionId={session?.id} me={me} compact />
          </div>
        )}
      </footer>
    </div>
  );
}