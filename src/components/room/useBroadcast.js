import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ICE_SERVERS, POINTER_KINDS, useSignalInbox, waitForIce } from './signal';
import { BITRATE, applyRealtimeSender, startAdaptiveStream } from '@/lib/streamProfile';

/** Sends one payload on one channel, and says whether it really went out. */
function sendOn(channel, payload) {
  if (!channel || channel.readyState !== 'open') return false;
  try {
    channel.send(JSON.stringify(payload));
    return true;
  } catch (err) {
    /* this peer dropped — the entity fallback still delivers */
    return false;
  }
}

export default function useBroadcast({ sessionId, stream, onMessage, onQuality }) {
  const [viewers, setViewers] = useState(0);
  const pcs = useRef(new Map());
  // One peer owns two channels: see offerTo.
  const channels = useRef(new Map());
  const tuners = useRef(new Map());
  const known = useRef(new Set());
  const streamRef = useRef(stream);
  const previous = useRef(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const quality = useRef(onQuality);
  quality.current = onQuality;

  const sendOverChannel = useCallback((payload) => {
    const pointerish = POINTER_KINDS.has(payload?.kind);
    let sent = false;
    channels.current.forEach((pair) => {
      // Pointer positions go over the unreliable channel first; everything that
      // must not be lost goes over the reliable one. Both are tried so a peer that
      // has only opened one of them still receives the event.
      const order = pointerish ? [pair.pointer, pair.input] : [pair.input, pair.pointer];
      for (const channel of order) {
        if (!channel || channel.readyState !== 'open') continue;
        // A backlog means the link has stalled: another stale position would only
        // add to the queue, so it is dropped instead.
        if (pointerish && channel.bufferedAmount > 64 * 1024) break;
        if (sendOn(channel, payload)) {
          sent = true;
          break;
        }
      }
    });
    return sent;
  }, []);

  const drop = useCallback((key) => {
    tuners.current.get(key)?.();
    tuners.current.delete(key);
    const pair = channels.current.get(key);
    if (pair) {
      [pair.pointer, pair.input].forEach((channel) => {
        try {
          channel?.close();
        } catch (err) {
          /* already gone */
        }
      });
      channels.current.delete(key);
    }
    const pc = pcs.current.get(key);
    if (pc) {
      try {
        pc.close();
      } catch (err) {
        /* already gone */
      }
      pcs.current.delete(key);
    }
    setViewers(pcs.current.size);
  }, []);

  const offerTo = useCallback(
    async (key) => {
      const current = streamRef.current;
      if (!current || !sessionId || !key) return;
      const existing = pcs.current.get(key);
      if (existing && existing.connectionState === 'connected') return;

      drop(key);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcs.current.set(key, pc);
      current.getTracks().forEach((track) => pc.addTrack(track, current));

      // Two channels, each answering a different problem:
      //
      // `pointer` is unordered and unreliable. A dropped packet is simply gone —
      // it was a position that the next packet already corrects, so nothing may
      // ever be waited for and nothing may queue up behind it.
      // `input` is its own SCTP stream, so a click or a key press is delivered in
      // order and never lost, and a lost pointer packet cannot hold it up. Typing
      // arrives in the order it was typed; a drag presses and releases in order.
      const pointer = pc.createDataChannel('pointer', { ordered: false, maxRetransmits: 0 });
      const input = pc.createDataChannel('input', { ordered: true });
      channels.current.set(key, { pointer, input });

      const receive = (event) => {
        try {
          handler.current?.(JSON.parse(event.data), key);
        } catch (err) {
          /* ignore malformed payloads */
        }
      };
      pointer.onmessage = receive;
      input.onmessage = receive;

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(key);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const video = pc.getSenders().find((sender) => sender.track?.kind === 'video');
      pc.getSenders().forEach((sender) => {
        // A screen is mostly still and then suddenly detailed. Told to keep the frame
        // rate, the encoder answers a tight link by shrinking the picture — which is
        // exactly the mush that makes remote text unreadable. The real-time profile
        // pins the resolution, asks for sixty frames, and lets the adaptive loop
        // below move the bitrate instead.
        if (sender.track) applyRealtimeSender(sender, BITRATE.start).catch(() => {});
      });
      // Keeps the bitrate matched to what the link can carry, and asks the capture
      // for a smaller JPEG while it cannot. Stopped with the peer.
      if (video) {
        tuners.current.set(
          key,
          startAdaptiveStream(video, { onQuality: (value) => quality.current?.(value) })
        );
      }
      await waitForIce(pc);
      setViewers(pcs.current.size);

      await base44.entities.SessionSignal.create({
        session_id: sessionId,
        kind: 'sdp-offer',
        from_role: 'host',
        viewer_key: key,
        payload: JSON.stringify(pc.localDescription),
      });
    },
    [sessionId, drop]
  );

  useSignalInbox(sessionId, (rec) => {
    if (rec.kind === 'viewer-hello' && rec.viewer_key) {
      known.current.add(rec.viewer_key);
      offerTo(rec.viewer_key);
    }
    if (rec.kind === 'sdp-answer' && rec.viewer_key && rec.payload) {
      const pc = pcs.current.get(rec.viewer_key);
      if (pc && !pc.currentRemoteDescription) {
        pc.setRemoteDescription(JSON.parse(rec.payload)).catch(() => {});
      }
    }
    // While a screen is being published, hellos and answers are looked for closely
    // so a viewer's picture starts at once; a idle room asks far less often.
  }, stream ? 500 : 1500);

  useEffect(() => {
    streamRef.current = stream;
    if (stream) {
      known.current.forEach((key) => offerTo(key));
    } else if (previous.current) {
      pcs.current.forEach((pc) => {
        try {
          pc.close();
        } catch (err) {
          /* already gone */
        }
      });
      pcs.current.clear();
      tuners.current.forEach((stop) => stop());
      tuners.current.clear();
      setViewers(0);
      base44.entities.SessionSignal.create({
        session_id: sessionId,
        kind: 'host-stop',
        from_role: 'host',
        viewer_key: '',
        payload: '',
      }).catch(() => {});
    }
    previous.current = stream;
  }, [stream, offerTo, sessionId]);

  useEffect(() => {
    if (stream) return;
    channels.current.forEach((pair) => {
      [pair.pointer, pair.input].forEach((channel) => {
        try {
          channel?.close();
        } catch (err) {
          /* already gone */
        }
      });
    });
    channels.current.clear();
  }, [stream]);

  useEffect(
    () => () => {
      pcs.current.forEach((pc) => {
        try {
          pc.close();
        } catch (err) {
          /* already gone */
        }
      });
      pcs.current.clear();
      tuners.current.forEach((stop) => stop());
      tuners.current.clear();
    },
    []
  );

  return { viewers, sendOverChannel };
}
