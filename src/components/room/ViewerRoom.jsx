import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Maximize2,
  Minimize2,
  MessageSquare,
  MapPin,
  MonitorSmartphone,
  Radio,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { safeSubscribe } from './signal';
import { base44 } from '@/api/base44Client';
import useViewer from './useViewer';
import useBeamMedia from './useBeamMedia';
import useHelpControl from './useHelpControl';
import BeamMediaStage from './BeamMediaStage';
import JoinRequests from './JoinRequests';
import ChatPanel from './ChatPanel';
import RoomTopBar from './RoomTopBar';
import ControlCapture from './ControlCapture';
import HelperPanel from './HelperPanel';
import useHelper from './useHelper';
import { Input } from '@/components/ui/input';

const CONTROL_OPTIONS = [
  { value: 'host', label: 'I control' },
  { value: 'guest', label: 'They control' },
];

export default function ViewerRoom({ session, me, canClaimHost }) {
  const navigate = useNavigate();
  const { stream, status, sendOverChannel } = useViewer({ sessionId: session.id });
  const { media, src } = useBeamMedia(session.id);
  const { holder, requests, giveTo, answer } = useHelpControl(
    session.mode === 'help' ? session.id : null
  );
  const helper = useHelper(session, me, false);
  const myRole = helper.myRole;
  const [ended, setEnded] = useState(session.status === 'ended');
  const [showChat, setShowChat] = useState(false);
  const [note, setNote] = useState('');
  const [full, setFull] = useState(false);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const lastPointer = useRef(0);
  const lastPos = useRef({ x: 0.5, y: 0.5 });

  const name = me?.full_name || me?.email || 'Guest';
  const isHelp = session.mode === 'help';

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const unsubscribe = safeSubscribe(base44.entities.CastSession, (event) => {
      if (event?.type === 'update' && event.data?.id === session.id && event.data.status === 'ended') {
        setEnded(true);
      }
    });
    const onFsChange = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [session.id]);

  const holderNow = helper.device?.control_holder || holder;
  const controls = !isHelp || holderNow === myRole;
  const controlling = isHelp && helper.connected && holderNow === myRole;

  const takeControl = (role) => {
    giveTo(role);
    helper.setControlHolder(role);
  };

  const send = (kind, point) => {
    if (!isHelp || !stream || !controls) return;
    if (sendOverChannel({ t: 'overlay', kind, x: point.x, y: point.y })) return;
    base44.entities.RoomEvent.create({
      session_id: session.id,
      kind,
      x: point.x,
      y: point.y,
      sender_name: name,
      text: '',
    }).catch(() => {});
  };

  const onMove = (event) => {
    if (!isHelp || !stream || !controls) return;
    const now = Date.now();
    if (now - lastPointer.current < 80) return;
    lastPointer.current = now;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
    lastPos.current = point;
    send('pointer', point);
  };

  const onTap = (event) => {
    if (!isHelp || !stream || !controls) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
    lastPos.current = point;
    send('click', point);
  };

  const pinNote = async (event) => {
    event.preventDefault();
    const text = note.trim();
    if (!text) return;
    setNote('');
    await base44.entities.RoomEvent.create({
      session_id: session.id,
      kind: 'note',
      x: lastPos.current.x,
      y: lastPos.current.y,
      sender_name: name,
      text: text.slice(0, 180),
    });
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await stageRef.current?.requestFullscreen?.();
    }
  };

  if (ended) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border">
          <Radio className="h-6 w-6 text-muted-foreground" />
        </span>
        <div>
          <p className="text-xl font-medium">This session has ended</p>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            The host closed room {session.code}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#040507]">
      <RoomTopBar
        code={session.code}
        mode={session.mode}
        live={status === 'live'}
        right={
          <button
            type="button"
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Full screen"
          >
            {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        }
      />

      <div
        ref={stageRef}
        onPointerMove={onMove}
        onClick={onTap}
        className={`relative flex flex-1 items-center justify-center overflow-hidden ${
          isHelp && stream ? 'cursor-crosshair' : ''
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full object-contain ${stream ? '' : 'hidden'}`}
        />

        {!stream && media && <BeamMediaStage media={media} src={src} />}

        {isHelp && <JoinRequests requests={requests} onAnswer={answer} />}

        {!stream && !media && (
          <div className="max-w-md px-6 text-center">
            <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/60">
              <MonitorSmartphone className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="text-2xl font-medium tracking-tight">
              {isHelp ? 'Waiting for their screen' : 'Waiting for the screen'}
            </p>
            <p className="mx-auto mt-2 max-w-[34ch] text-[13.5px] leading-relaxed text-muted-foreground">
              {isHelp
                ? 'Send them the code below. The moment they share their screen it appears here, and you can point, tap and pin notes on it.'
                : 'Keep this open on the TV. As soon as the host starts sharing, it appears here.'}
            </p>
            <p className="mt-6 font-mono text-4xl tracking-[0.32em] text-foreground">
              {session.code}
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {status === 'connecting' ? 'Connecting…' : 'Standing by'}
            </p>
            {canClaimHost && (
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(`beam-host-${session.code}`, '1');
                  window.location.reload();
                }}
                className="mt-6 rounded-full border border-border px-4 py-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                Present from this device instead
              </button>
            )}
          </div>
        )}

        {controlling && (
          <ControlCapture
            sessionId={session.id}
            stageRef={stageRef}
            videoRef={videoRef}
            role={myRole}
            onPoint={(point) => sendOverChannel({ t: 'overlay', ...point })}
          />
        )}
      </div>

      <div className="border-t border-border/70 bg-background/70 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          {isHelp ? (
            <form onSubmit={pinNote} className="flex flex-1 items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0 text-accent" />
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Pin a note on their screen"
                className="h-9 flex-1 border-border bg-background text-[12.5px]"
              />
              <button
                type="submit"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Pin note"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              {media
                ? `Photo from ${media.sender_name || 'a guest'} — tap full screen for the TV.`
                : `Mirroring ${session.host_name || 'a screen'} — tap full screen for the TV.`}
            </p>
          )}

          <div className="flex items-center gap-2">
            {isHelp && (
              <div className="flex items-center gap-1 rounded-full border border-border p-1">
                {CONTROL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => takeControl(option.value)}
                    className={`rounded-full px-3 py-1 text-[11.5px] transition-colors ${
                      holderNow === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            {stream && (
              <button
                type="button"
                onClick={() => setMuted((value) => !value)}
                className="flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {muted ? 'Sound off' : 'Sound on'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowChat((value) => !value)}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] transition-colors ${
                showChat ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border text-muted-foreground'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </button>
          </div>
        </div>

        {isHelp && (
          <div className="mx-auto mt-3 max-w-4xl">
            <HelperPanel session={session} helper={helper} />
          </div>
        )}

        {showChat && (
          <div className="mx-auto mt-3 max-w-4xl">
            <ChatPanel sessionId={session.id} me={me} compact />
          </div>
        )}
      </div>
    </div>
  );
}