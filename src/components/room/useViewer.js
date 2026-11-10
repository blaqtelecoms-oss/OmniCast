import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ICE_SERVERS, randomKey, useSignalInbox, waitForIce } from './signal';

export default function useViewer({ sessionId, onMessage }) {
  const [stream, setStream] = useState(null);
  const [status, setStatus] = useState('connecting');
  const key = useRef(randomKey());
  const pcRef = useRef(null);
  const channelRef = useRef(null);
  const liveRef = useRef(false);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  const sendOverChannel = (payload) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== 'open') return false;
    try {
      channel.send(JSON.stringify(payload));
      return true;
    } catch (err) {
      return false;
    }
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

    hello();
    const timer = setInterval(hello, 6000);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [sessionId]);

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
      channelRef.current = event.channel;
      event.channel.onmessage = (message) => {
        try {
          handler.current?.(JSON.parse(message.data));
        } catch (err) {
          /* ignore malformed payloads */
        }
      };
    };

    pc.ontrack = (event) => {
      // Watching a screen is live work. Buffering frames to smooth playback only puts
      // delay between a click and its result, so the smallest playout delay is asked
      // for (newer browsers use jitterBufferTarget, older ones playoutDelayHint).
      try {
        event.receiver.jitterBufferTarget = 0;
      } catch (err) {
        /* not supported here */
      }
      try {
        event.receiver.playoutDelayHint = 0;
      } catch (err) {
        /* not supported here */
      }
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
  });

  useEffect(() => () => disconnect(), []);

  return { stream, status, sendOverChannel };
}