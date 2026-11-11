import { useEffect, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useBroadcast from '@/components/room/useBroadcast';
import PeerPointer from '@/components/room/PeerPointer';
import { findLocalDevice } from '@/lib/localAgent';

const RELAY_PORTS = [47823, 47824, 47825, 47826, 47827];

/**
 * Publishes the screen this browser captured into a device session, so the
 * person remoting in can watch while the companion injects input locally.
 *
 * Their clicks and keys arrive over the live channel and are handed to the
 * companion on this machine over localhost, which is what makes control feel
 * immediate instead of waiting on the cloud queue. `agentToken` is only present
 * when the companion itself opened this page.
 */
export default function SharePublisher({ sessionId, stream, agentToken, onViewRequest, onQuality }) {
  const videoRef = useRef(null);
  const viewSet = useRef(onViewRequest);
  viewSet.current = onViewRequest;
  const [peer, setPeer] = useState(null);
  const portRef = useRef(0);
  const tokenRef = useRef(agentToken || '');
  const askedAt = useRef(0);
  const downUntil = useRef(0);
  const outbox = useRef([]);
  const sending = useRef(false);

  /**
   * The companion only accepts input from a request that carries the token it
   * minted when it started, and it hands that token out on localhost alone. So the
   * token is fetched here whenever this page was opened by hand instead of by the
   * companion — otherwise every click and key would be refused on arrival.
   */
  const localToken = async () => {
    if (tokenRef.current) return tokenRef.current;
    if (Date.now() - askedAt.current < 10000) return '';
    askedAt.current = Date.now();
    const found = await findLocalDevice().catch(() => null);
    if (found?.token) {
      tokenRef.current = found.token;
      if (found.port) portRef.current = found.port;
    }
    return tokenRef.current;
  };

  const post = async (input) => {
    const token = await localToken();
    if (!token) return false;
    const order = portRef.current
      ? [portRef.current, ...RELAY_PORTS.filter((port) => port !== portRef.current)]
      : RELAY_PORTS;
    for (const port of order) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/input`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, input }),
          signal: AbortSignal.timeout(800),
        });
        if (res.ok) {
          portRef.current = port;
          return true;
        }
      } catch (err) {
        /* not the companion on this port — try the next one */
      }
    }
    return false;
  };

  // One request at a time, and pointer positions collapse into the newest one:
  // queuing every move would make the cursor trail seconds behind the click.
  const pump = async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (outbox.current.length) {
        // Only the newest pointer position is worth sending — every earlier one has
        // already been overtaken. Clicks and keys are never dropped, and stay in order.
        const newestMove = outbox.current.map((item) => item.kind).lastIndexOf('move');
        outbox.current = outbox.current.filter(
          (item, index) => item.kind !== 'move' || index === newestMove
        );
        const dropped = outbox.current.shift();
        const ok = await post(dropped);
        if (!ok) {
          // Nothing answered on this computer's relay, so what is left travels the
          // slower way: the queue its companion also reads. A click that arrives late
          // still beats a click that never arrives.
          const rest = outbox.current.splice(0);
          for (const item of [dropped, ...rest]) {
            base44.entities.ControlInput.create({
              session_id: sessionId,
              kind: item.kind,
              from_role: 'host',
              x: item.x,
              y: item.y,
              payload: item.payload,
              delivered: false,
            }).catch(() => {});
          }
          downUntil.current = Date.now() + 5000;
          break;
        }
      }
    } finally {
      sending.current = false;
    }
  };

  const relayLocal = (input) => {
    if (Date.now() < downUntil.current) return;
    outbox.current.push(input);
    pump();
  };

  const { viewers } = useBroadcast({
    sessionId,
    stream,
    // The adaptive bitrate loop says how much the link can carry; the capture is
    // grabbed at that sharpness so congestion costs detail, never frame rate.
    onQuality,
    onMessage: (message) => {
      if (message?.t === 'overlay') {
        setPeer({ x: message.x, y: message.y, kind: message.kind, at: Date.now() });
        return;
      }
      if (message?.t === 'control') {
        relayLocal({ kind: message.kind, x: message.x, y: message.y, payload: message.payload });
        return;
      }
      // The viewer says how many pixels its own screen shows. Capturing at that size
      // keeps text sharp at a fraction of the bandwidth a full 4K desktop would cost.
      if (message?.t === 'view' && message.width) viewSet.current?.(message.width);
    },
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    // A capture stream handed to an element that has not been asked to play can sit
    // on its first, empty frame — a black preview of a screen that is being shared.
    if (stream) video.play().catch(() => {});
  }, [stream]);

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card/60">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="flex items-center gap-2 text-[12.5px] text-foreground">
          <Eye className="h-3.5 w-3.5 text-accent" />
          Sharing this screen — their cursor shows here
        </p>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {viewers} {viewers === 1 ? 'viewer' : 'viewers'}
        </span>
      </div>

      <div className="relative aspect-video bg-[#06070a]">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" />
        <PeerPointer point={peer} label="Remote" />
        {!viewers && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-4">
            <span className="rounded-full bg-background/85 px-3 py-1 text-[11px] text-muted-foreground ring-1 ring-border">
              Waiting for them to open this computer
            </span>
          </div>
        )}
      </div>
    </section>
  );
}