import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ICE_SERVERS, POINTER_KINDS, randomKey, useSignalInbox, waitForIce } from './signal';

/**
 * The receive side of the real-time profile: a screen has no future worth
 * buffering, so the jitter buffer is told to keep nothing. Both spellings are set
 * because browsers disagree on which one they honour.
 */
function realtimeReceiver(receiver) {
  try {
    receiver.jitterBufferTarget = 0;
  } catch (err) {
    /* not supported here */
  }
  try {
    receiver.playoutDelayHint = 0;
  } catch (err) {
    /* not supported here */
  }
}

export default function useViewer({ sessionId, onMessage }) {
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState('connecting');
  const key = useRef(randomKey());
  const pcRef = useRef(null);
  // The host opens two channels: `pointer` is unordered and unreliable, `input`
  // carries clicks, keys and drags in order. Each is kept apart here so a payload
  // goes out the one that matches what it is.
  const pointerRef = useRef(null);
  const inputRef = useRef(null);
  const channelRef = useRef(null);
  const liveRef = useRef(false);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  const sendOverChannel = (payload) => {
    const pointerish = POINTER_KINDS.has(payload?.kind);
    const order = pointerish
      ? [pointerRef.current, inputRef.current]
      : [inputRef.current, pointerRef.current];
    for (const channel of order) {
      if (!channel || channel.readyState !== 'open') continue;
      // A stalled link must not be fed more positions that are already out of date.
      if (pointerish && channel.bufferedAmount > 64 * 1024) return false;
      try {
        channel.send(JSON.stringify(payload));
        return true;
      } catch (err) {
        /* try the other channel — it may still be healthy */
      }
    }
    return false;
  };

  const disconnect = () => {
    if (channelRef.current) {
      try {
        channelRef.current.close();
      } catch (err) {
        /* already gone */
      }
      channelRef.current = null;
    }
    pointerRef.current = null;
    inputRef.current = null;
    const pc = pcRef.current;
    if (pc) {
      try {
        pc.close();
      } catch (err) {
        /* already gone */
      }
    }
    pcRef.current = null;
    liveRef.current = false;
    setStream(null);
  };

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    const hello = async () => {
      if (stopped) return;
      // A live connection is left alone, but one whose control channel died is asked
      // for again: otherwise the picture can keep playing while clicks go nowhere.
      const channel = channelRef.current;
      if (liveRef.current && channel && channel.readyState === 'open') return;
      try {
        await base44.entities.SessionSignal.create({
          session_id: sessionId,
          kind: 'viewer-hello',
          from_role: 'viewer',
          viewer_key: key.current,
          payload: '',
        });
      } catch (err) {
        /* retried on the next tick */
      }
    };

    // While there is no picture yet every moment counts, so the hello is repeated
    // every second until the stream is running; after that it is only a keep-alive.
    let timer = null;
    const tick = async () => {
      await hello();
      if (!stopped) timer = setTimeout(tick, liveRef.current ? 6000 : 1200);
    };
    tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [sessionId]);

  // Connecting is watched closely; a running picture is not, so the fallback ask
  // slows down once it is live.
  useSignalInbox(sessionId, async (rec) => {
    if (!rec) return;

    if (rec.kind === 'host-stop') {
      disconnect();
      setStatus('waiting');
      return;
    }

    if (rec.kind !== 'sdp-offer') return;
    if (rec.viewer_key !== key.current) return;
    if (!rec.payload) return;
    // A fresh offer is taken while the old connection has no working channel: that
    // is the share page having reconnected, not a duplicate of a healthy one.
    const working = channelRef.current && channelRef.current.readyState === 'open';
    if (liveRef.current && working) return;

    disconnect();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      if (channel.label === 'pointer') pointerRef.current = channel;
      else inputRef.current = channel;
      // Whichever arrived last answers "is the link alive" — both come from the
      // same peer, so either one open is proof enough.
      channelRef.current = channel;
      channel.onmessage = (message) => {
        try {
          handler.current?.(JSON.parse(message.data));
        } catch (err) {
          /* ignore malformed payloads */
        }
      };
    };

    pc.ontrack = (event) => {
      // Watching a screen is live work, so the real-time receive profile is applied
      // before the first frame is drawn.
      realtimeReceiver(event.receiver);
      liveRef.current = true;
      setStream(event.streams[0] || new MediaStream([event.track]));
      setStatus('live');
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        disconnect();
        setStatus('waiting');
      }
    };

    try {
      await pc.setRemoteDescription(JSON.parse(rec.payload));
      // Once the description is in place every receiver exists, so the profile is
      // applied to all of them rather than only to the track that arrives first.
      pc.getReceivers().forEach(realtimeReceiver);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);
      await base44.entities.SessionSignal.create({
        session_id: sessionId,
        kind: 'sdp-answer',
        from_role: 'viewer',
        viewer_key: key.current,
        payload: JSON.stringify(pc.localDescription),
      });
    } catch (err) {
      setStatus('waiting');
    }
  }, status === 'live' ? 1500 : 400);

  useEffect(() => () => disconnect(), []);

  return { stream, status, sendOverChannel };
}
