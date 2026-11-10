import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const POLL_MS = 1500;

/**
 * Owns one live room: presence, the screen stream being published and the
 * peer connections that carry it. Signalling runs over the API by polling so
 * nothing here depends on a websocket surviving a proxy.
 */
export default function useRoom({ initialCode, displayName }) {
  const [code, setCode] = useState(initialCode && initialCode !== 'new' ? initialCode.toUpperCase() : '');
  const [peerId, setPeerId] = useState('');
  const [role, setRole] = useState('');
  const [peers, setPeers] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [sharing, setSharing] = useState(false);

  // The room is opened once for this component's lifetime: a later URL change
  // (e.g. /room/new -> /room/ABCDEF) must not re-register as another persona.
  const start = useRef({ initialCode, displayName });
  const peerIdRef = useRef('');
  const codeRef = useRef('');
  const roleRef = useRef('');
  const sharingRef = useRef(false);
  const localStreamRef = useRef(null);
  const connections = useRef(new Map());
  const busy = useRef(false);
  const runId = useRef(0);

  const send = useCallback(async (to, type, payload) => {
    if (!codeRef.current || !peerIdRef.current) return;
    try {
      await base44.rooms.signal(codeRef.current, {
        peer: peerIdRef.current,
        to,
        type,
        payload,
      });
    } catch {
      /* transient — the next poll retries presence */
    }
  }, []);

  const ensureConnection = useCallback(
    (remoteId, { initiator }) => {
      const existing = connections.current.get(remoteId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE);
      const record = { pc, pendingIce: [] };
      connections.current.set(remoteId, record);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send(remoteId, 'ice', event.candidate.toJSON ? event.candidate.toJSON() : event.candidate);
        }
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) setRemoteStream(stream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          connections.current.delete(remoteId);
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      if (initiator) send(remoteId, 'ready', {});

      return record;
    },
    [send]
  );

  const drainIce = async (record) => {
    const queued = record.pendingIce.splice(0);
    for (const candidate of queued) {
      try {
        await record.pc.addIceCandidate(candidate);
      } catch {
        /* a candidate can arrive after the connection is gone */
      }
    }
  };

  const offerTo = useCallback(
    async (remoteId) => {
      if (!localStreamRef.current) return;
      const record = ensureConnection(remoteId, { initiator: true });
      try {
        const offer = await record.pc.createOffer();
        await record.pc.setLocalDescription(offer);
        await send(remoteId, 'offer', { type: offer.type, sdp: offer.sdp });
      } catch {
        connections.current.delete(remoteId);
      }
    },
    [ensureConnection, send]
  );

  const handleMessage = useCallback(
    async (message) => {
      if (message.type === 'offer') {
        const record = ensureConnection(message.from, { initiator: false });
        await record.pc.setRemoteDescription(message.payload);
        await drainIce(record);
        const answer = await record.pc.createAnswer();
        await record.pc.setLocalDescription(answer);
        await send(message.from, 'answer', { type: answer.type, sdp: answer.sdp });
        return;
      }

      if (message.type === 'answer') {
        const record = connections.current.get(message.from);
        if (!record) return;
        await record.pc.setRemoteDescription(message.payload);
        await drainIce(record);
        return;
      }

      if (message.type === 'ice') {
        const record = connections.current.get(message.from);
        if (!record) return;
        if (record.pc.remoteDescription) {
          try {
            await record.pc.addIceCandidate(message.payload);
          } catch {
            /* ignore */
          }
        } else {
          record.pendingIce.push(message.payload);
        }
      }
    },
    [ensureConnection, send]
  );

  useEffect(() => {
    const myRun = ++runId.current;
    const active = () => runId.current === myRun;
    const { initialCode: startCode, displayName: startName } = start.current;

    const poll = async () => {
      if (busy.current || !active() || !codeRef.current || !peerIdRef.current) return;
      busy.current = true;
      try {
        const state = await base44.rooms.state(codeRef.current, peerIdRef.current, sharingRef.current);
        if (!active()) return;
        setPeers(state.peers || []);
        setRole(state.role || roleRef.current);
        setStatus('ready');

        for (const message of state.messages || []) {
          try {
            await handleMessage(message);
          } catch {
            /* one bad message should not end the room */
          }
        }

        if (roleRef.current === 'host' && localStreamRef.current) {
          for (const peer of state.peers || []) {
            if (peer.id === peerIdRef.current) continue;
            if (!connections.current.has(peer.id)) await offerTo(peer.id);
          }
        }
      } catch (err) {
        if (!active()) return;
        if (err.status === 404) {
          setStatus('ended');
          setError('This room has closed.');
        }
      } finally {
        busy.current = false;
      }
    };

    const join = async () => {
      try {
        const result =
          startCode && startCode !== 'new'
            ? await base44.rooms.join(startCode.toUpperCase(), { name: startName })
            : await base44.rooms.create({ name: startName });

        if (!active()) {
          base44.rooms.leave(result.code, result.peerId).catch(() => {});
          return;
        }

        codeRef.current = result.code;
        peerIdRef.current = result.peerId;
        roleRef.current = result.role;
        setCode(result.code);
        setPeerId(result.peerId);
        setRole(result.role);
        setPeers([{ id: result.peerId, name: startName, role: result.role, sharing: false }]);
        setStatus('ready');
      } catch (err) {
        if (!active()) return;
        setStatus('error');
        setError(
          err.status === 404 ? 'No live room uses that code.' : err.message || 'Could not open the room.'
        );
      }
    };

    join();
    const timer = window.setInterval(poll, POLL_MS);

    return () => {
      runId.current += 1;
      window.clearInterval(timer);
      if (codeRef.current && peerIdRef.current) {
        base44.rooms.leave(codeRef.current, peerIdRef.current).catch(() => {});
      }
      connections.current.forEach((record) => record.pc.close());
      connections.current.clear();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      localStreamRef.current = null;
    };
  }, [handleMessage, offerTo]);

  const stopShare = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = null;
    sharingRef.current = false;
    setLocalStream(null);
    setSharing(false);
    setRemoteStream(null);
    connections.current.forEach((record) => {
      record.pc.getSenders().forEach((sender) => {
        if (sender.track?.kind === 'video') record.pc.removeTrack(sender);
      });
    });
  }, []);

  const startShare = useCallback(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    localStreamRef.current = stream;
    sharingRef.current = true;
    setLocalStream(stream);
    setSharing(true);
    stream.getVideoTracks()[0]?.addEventListener('ended', stopShare);

    for (const peer of peers) {
      if (peer.id === peerIdRef.current) continue;
      await offerTo(peer.id);
    }
  }, [offerTo, peers, stopShare]);

  return {
    code,
    peerId,
    role,
    peers,
    status,
    error,
    localStream,
    remoteStream,
    sharing,
    startShare,
    stopShare,
  };
}
