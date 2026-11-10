import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MonitorPlay, Square, Link2, Check, Hand, MonitorSmartphone } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useBroadcast from './useBroadcast';
import useHelpControl from './useHelpControl';
import ChatPanel from './ChatPanel';
import RemotePointers from './RemotePointers';
import PeerPointer from './PeerPointer';
import RoomTopBar from './RoomTopBar';
import PhoneBeamPanel from './PhoneBeamPanel';
import useDeviceCaps from './useDeviceCaps';
import useHelper from './useHelper';
import HelperPanel from './HelperPanel';

export default function HostRoom({ session, me }) {
  const navigate = useNavigate();
  const caps = useDeviceCaps();
  const [stream, setStream] = useState(null);
  const [shareBlocked, setShareBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const videoRef = useRef(null);
  const endedRef = useRef(false);
  const [peer, setPeer] = useState(null);
  const { viewers } = useBroadcast({
    sessionId: session.id,
    stream,
    onMessage: (message) => {
      if (message?.t !== 'overlay') return;
      setPeer({ x: message.x, y: message.y, kind: message.kind, at: Date.now() });
    },
  });
  const { holder } = useHelpControl(session.mode === 'help' ? session.id : null);
  const helper = useHelper(session, me, session.mode === 'help');
  const phoneOnly = !caps.canShareScreen || shareBlocked;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  useEffect(
    () => () => {
      if (!endedRef.current) {
        base44.entities.CastSession.update(session.id, { status: 'ended' }).catch(() => {});
      }
    },
    [session.id]
  );

  const start = async () => {
    setNotice('');
    try {
      let next;
      try {
        next = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true,
        });
      } catch (err) {
        next = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } });
      }
      next.getVideoTracks()[0]?.addEventListener('ended', () => setStream(null));
      setStream(next);
    } catch (err) {
      setShareBlocked(true);
      setNotice('This device will not share its screen from a browser — send a photo instead.');
    }
  };

  const stop = () => {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
  };

  const end = async () => {
    endedRef.current = true;
    stream?.getTracks().forEach((track) => track.stop());
    try {
      await base44.entities.CastSession.update(session.id, { status: 'ended' });
    } catch (err) {
      /* a guest sharing in a help room cannot close someone else's room */
    }
    navigate('/');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${session.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setNotice('Copy is blocked — share the code instead.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <RoomTopBar
        code={session.code}
        mode={session.mode}
        live={Boolean(stream)}
        viewers={viewers}
        right={
          <button
            type="button"
            onClick={end}
            className="rounded-full border border-border px-3.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
          >
            End session
          </button>
        }
      />

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 lg:grid-cols-[1fr_340px] lg:p-6">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-[#06070a]">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-contain ${stream ? '' : 'hidden'}`}
            />
            {session.mode === 'help' && stream && (
              <>
                <RemotePointers sessionId={session.id} />
                <PeerPointer point={peer} />
              </>
            )}

            {!stream && phoneOnly && <PhoneBeamPanel session={session} me={me} />}

            {!stream && !phoneOnly && (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background/60">
                  <MonitorPlay className="h-6 w-6 text-muted-foreground" />
                </span>
                <div>
                  <p className="text-base font-medium">
                    {session.mode === 'help' ? 'Share the screen you need help with' : 'Share a screen to go live'}
                  </p>
                  <p className="mx-auto mt-1 max-w-[38ch] text-[13px] leading-relaxed text-muted-foreground">
                    {session.mode === 'help'
                      ? 'Pick the window or the whole screen. They see it live and can point, tap and leave notes — you stay in control.'
                      : 'Pick a window, a tab or the whole screen. Everyone with the code sees it the moment you start.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={start}
                  className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Share this screen
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/50 px-4 py-3">
            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              {session.mode === 'help' ? (
                <>
                  <Hand className="h-4 w-4 text-accent" />
                  {holder === 'host'
                    ? 'The host has control — their pointer and clicks show on this screen.'
                    : 'Control is yours — the host can watch, point and leave notes.'}
                </>
              ) : (
                <>
                  <MonitorSmartphone className="h-4 w-4 text-accent" />
                  Anyone with the code can watch, on any device.
                </>
              )}
            </div>
            {stream ? (
              <button
                type="button"
                onClick={stop}
                className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-[12px] transition-colors hover:border-destructive/50 hover:text-destructive"
              >
                <Square className="h-3 w-3" />
                Stop sharing
              </button>
            ) : !phoneOnly ? (
              <button
                type="button"
                onClick={start}
                className="rounded-full border border-border px-4 py-2 text-[12px] transition-colors hover:text-foreground"
              >
                Share screen
              </button>
            ) : null}
          </div>

          {notice && (
            <p className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-[12.5px] text-muted-foreground">
              {notice}
            </p>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card/60 p-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              Pairing code
            </p>
            <p className="mt-1 font-mono text-3xl tracking-[0.3em] text-foreground">
              {session.code}
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {session.mode === 'help'
                ? 'Send this code to the person helping you — they will see this screen and guide you.'
                : 'On the TV or the other device, open this site and enter the code.'}
            </p>
            <button
              type="button"
              onClick={copyLink}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-[12px] transition-colors hover:bg-secondary"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Link2 className="h-3.5 w-3.5" />}
              {copied ? 'Link copied' : 'Copy room link'}
            </button>
          </div>

          {session.mode === 'help' && <HelperPanel session={session} helper={helper} />}

          <ChatPanel sessionId={session.id} me={me} />
        </aside>
      </div>
    </div>
  );
}