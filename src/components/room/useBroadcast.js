import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ICE_SERVERS, useSignalInbox, waitForIce } from './signal';

export default function useBroadcast({ sessionId, stream, onMessage }) {
  const [viewers, setViewers] = useState(0);
  const pcs = useRef(new Map());
  const channels = useRef(new Map());
  const known = useRef(new Set());
  const streamRef = useRef(stream);
  const previous = useRef(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  const sendOverChannel = useCallback((payload) => {
    let sent = false;
    channels.current.forEach((channel) => {
      if (channel.readyState === 'open') {
        try {
          channel.send(JSON.stringify(payload));
          sent = true;
        } catch (err) {
          /* this peer dropped — the entity fallback still delivers */
        }
      }
    });
    return sent;
  }, []);

  const drop = useCallback((key) => {
    const channel = channels.current.get(key);
    if (channel) {
      try {
        channel.close();
      } catch (err) {
        /* already gone */
      }
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

      // Unordered: a dropped packet must never hold up the pointer positions queued
      // behind it, which is what turns a brief network hiccup into a stuck cursor.
      const channel = pc.createDataChannel('overlay', { ordered: false });
      channels.current.set(key, channel);
      channel.onmessage = (event) => {
        try {
          handler.current?.(JSON.parse(event.data), key);
        } catch (err) {
          /* ignore malformed payloads */
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(key);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // A live screen is judged by how smoothly the pointer moves, not by how sharp
      // a single frame looks: when the network is tight, keep the frame rate.
      pc.getSenders().forEach((sender) => {
        try {
          const params = sender.getParameters();
          // A screen is mostly still and then suddenly detailed; the default bitrate
          // budget is what smears it into mush. Room is made for sharpness, while
          // the frame rate still wins when the network is tight.
          if (!params.encodings || !params.encodings.length) params.encodings = [{}];
          params.encodings[0].maxBitrate = 8_000_000;
          params.encodings[0].maxFramerate = 30;
          params.degradationPreference = 'maintain-framerate';
          sender.setParameters(params).catch(() => {});
        } catch (err) {
          /* this browser keeps its own default */
        }
      });
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
    channels.current.forEach((channel) => {
      try {
        channel.close();
      } catch (err) {
        /* already gone */
      }
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
    },
    []
  );

  return { viewers, sendOverChannel };
}