import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Check,
  Copy,
  Loader2,
  MonitorUp,
  Radio,
  Square,
  Users,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import useRoom from '@/lib/useRoom';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

export default function Room() {
  const { code: routeCode } = useParams();
  return <RoomSession key={routeCode || 'new'} routeCode={routeCode} />;
}

function RoomSession({ routeCode }) {
  const { user } = useAuth();
  const displayName = user?.name || 'Guest';
  const room = useRoom({ initialCode: routeCode, displayName });
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState('');
  const [working, setWorking] = useState(false);

  const liveCode = room.code || (routeCode && routeCode !== 'new' ? routeCode.toUpperCase() : '');

  const share = async () => {
    setShareError('');
    if (room.sharing) {
      room.stopShare();
      return;
    }
    setWorking(true);
    try {
      await room.startShare();
    } catch {
      setShareError('The screen picker was cancelled or blocked by the browser.');
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    document.title = liveCode ? `Room ${liveCode} · beam` : 'Room · beam';
    return () => {
      document.title = 'beam — mirror a screen, or help someone through theirs';
    };
  }, [liveCode]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/room/${liveCode}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const others = room.peers.filter((peer) => peer.id !== room.peerId);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-8">
        <Link to="/" className="group flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30">
            <span className="h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:block">beam</span>
        </Link>

        <div className="flex items-center gap-2">
          <span className="label-micro hidden sm:block">Room</span>
          {liveCode ? (
            <button
              type="button"
              onClick={copyLink}
              className="focus-ring flex h-9 items-center gap-2 rounded-full border border-border px-3.5 font-mono text-sm tracking-[0.3em] text-foreground transition-colors hover:bg-secondary/60"
              title="Copy the invite link"
            >
              {liveCode}
              {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <Users className="h-3 w-3" />
            {room.peers.length} here
          </span>
          <Button as={Link} to="/" variant="ghost" size="sm">
            Leave
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-8 sm:py-6 lg:flex-row">
        <section className="relative flex-1 overflow-hidden rounded-xl border border-border/80 bg-black/60">
          <div className="relative flex aspect-video h-full w-full items-center justify-center">
            {room.remoteStream ? (
              <video
                autoPlay
                playsInline
                ref={(node) => {
                  if (node && node.srcObject !== room.remoteStream) node.srcObject = room.remoteStream;
                }}
                className="h-full w-full object-contain"
              />
            ) : room.localStream ? (
              <>
                <video
                  autoPlay
                  muted
                  playsInline
                  ref={(node) => {
                    if (node && node.srcObject !== room.localStream) node.srcObject = room.localStream;
                  }}
                  className="h-full w-full object-contain"
                />
                <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                  You are live
                </span>
              </>
            ) : (
              <div className="max-w-sm px-6 text-center">
                {room.status === 'connecting' ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                ) : room.status === 'error' || room.status === 'ended' ? (
                  <WifiOff className="mx-auto h-5 w-5 text-destructive" />
                ) : room.role === 'host' ? (
                  <MonitorUp className="mx-auto h-5 w-5 text-muted-foreground" />
                ) : (
                  <Radio className="mx-auto h-5 w-5 text-muted-foreground" />
                )}

                <p className="mt-4 font-display text-2xl leading-tight tracking-tight">
                  {room.status === 'error' || room.status === 'ended'
                    ? room.error || 'This room is no longer live.'
                    : room.role === 'host'
                      ? 'Nothing on screen yet'
                      : 'Waiting for the host to share'}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {room.role === 'host'
                    ? 'Pick a window or your whole desktop — the person in the room sees only what you choose.'
                    : 'As soon as they start sharing, the screen appears here.'}
                </p>

                {room.role === 'host' && room.status === 'ready' ? (
                  <Button className="mt-5" onClick={share} disabled={working}>
                    {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <MonitorUp className="h-4 w-4" />}
                    Share this screen
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <aside className="w-full shrink-0 space-y-4 lg:w-80">
          <div className="rounded-xl border border-border/80 bg-card/60 p-5">
            <p className="label-micro">{room.role === 'host' ? 'Host' : 'Guest'}</p>
            <h2 className="mt-2 font-display text-2xl tracking-tight">
              {room.role === 'host' ? 'You are running this room' : 'You are watching this room'}
            </h2>

            <div className="mt-4 flex flex-col gap-2">
              <Button variant={room.sharing ? 'danger' : 'primary'} onClick={share} disabled={working}>
                {room.sharing ? <Square className="h-3.5 w-3.5" /> : <MonitorUp className="h-4 w-4" />}
                {room.sharing ? 'Stop sharing' : 'Share my screen'}
              </Button>
              <Button variant="outline" onClick={copyLink} disabled={!liveCode}>
                <Copy className="h-3.5 w-3.5" />
                Copy invite link
              </Button>
            </div>

            {shareError ? <p className="mt-3 text-xs text-muted-foreground">{shareError}</p> : null}
          </div>

          <div className="rounded-xl border border-border/80 bg-card/40 p-5">
            <div className="flex items-center justify-between">
              <p className="label-micro">In the room</p>
              <span className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
                {room.peers.length}
              </span>
            </div>

            <ul className="mt-3 space-y-2">
              {room.peers.map((peer) => (
                <li key={peer.id} className="flex items-center gap-2.5 text-sm">
                  <span
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold uppercase',
                      peer.role === 'host' ? 'bg-primary/15 text-primary' : 'bg-secondary text-muted-foreground'
                    )}
                  >
                    {(peer.name || '?').slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {peer.name}
                    {peer.id === room.peerId ? ' (you)' : ''}
                  </span>
                  {peer.sharing ? (
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">live</span>
                  ) : null}
                </li>
              ))}
              {!room.peers.length ? (
                <li className="text-xs text-muted-foreground">Just you so far.</li>
              ) : null}
            </ul>

            {others.length === 0 && room.role === 'host' ? (
              <p className="mt-4 border-t border-border/70 pt-3 text-xs leading-relaxed text-muted-foreground">
                Share the code <span className="font-mono text-foreground">{liveCode}</span> — anyone with it
                joins from Join a session.
              </p>
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}
