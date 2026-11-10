import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { randomKey, useSignalInbox } from './signal';

export default function useJoinGate({ sessionId, name }) {
  const key = useRef(randomKey()).current;
  const [status, setStatus] = useState('waiting');

  useSignalInbox(sessionId, (rec) => {
    if (!rec || rec.viewer_key !== key) return;
    if (rec.kind === 'join-accept') setStatus('accepted');
    if (rec.kind === 'join-decline') setStatus('declined');
  });

  useEffect(() => {
    if (!sessionId || status === 'accepted' || status === 'declined') return;

    const ask = () =>
      base44.entities.SessionSignal.create({
        session_id: sessionId,
        kind: 'join-request',
        from_role: 'viewer',
        viewer_key: key,
        payload: name,
      }).catch(() => {});

    ask();
    const timer = setInterval(ask, 5000);
    return () => clearInterval(timer);
  }, [sessionId, status, key, name]);

  const askAgain = () => setStatus('waiting');

  return { status, askAgain };
}