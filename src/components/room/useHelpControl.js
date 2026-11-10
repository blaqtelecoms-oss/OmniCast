import { useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useSignalInbox } from './signal';

const JOIN_KINDS = ['join-request', 'join-accept', 'join-decline'];
const stamp = (rec) => new Date(rec.created_date || 0).getTime();

export default function useHelpControl(sessionId) {
  const [holder, setHolder] = useState('host');
  const [events, setEvents] = useState([]);
  const newest = useRef(0);

  useSignalInbox(sessionId, (rec) => {
    if (!rec) return;
    if (rec.kind === 'control-set' && rec.payload) {
      const at = stamp(rec);
      if (at < newest.current) return;
      newest.current = at;
      setHolder(rec.payload === 'guest' ? 'guest' : 'host');
      return;
    }
    if (JOIN_KINDS.includes(rec.kind) && rec.viewer_key) {
      setEvents((prev) => [...prev, rec]);
    }
  });

  const requests = useMemo(() => {
    const byKey = new Map();
    [...events]
      .sort((a, b) => stamp(a) - stamp(b))
      .forEach((rec) => {
        const entry = byKey.get(rec.viewer_key) || { key: rec.viewer_key, name: 'Guest' };
        if (rec.kind === 'join-request') {
          entry.name = rec.payload || entry.name;
          entry.status = 'pending';
        } else if (rec.kind === 'join-accept') {
          entry.status = 'accepted';
        } else {
          entry.status = 'declined';
        }
        byKey.set(rec.viewer_key, entry);
      });
    return [...byKey.values()].filter((item) => item.status === 'pending');
  }, [events]);

  const giveTo = (next) =>
    base44.entities.SessionSignal.create({
      session_id: sessionId,
      kind: 'control-set',
      from_role: 'host',
      viewer_key: '',
      payload: next,
    }).catch(() => {});

  const answer = (viewerKey, kind, name) =>
    base44.entities.SessionSignal.create({
      session_id: sessionId,
      kind,
      from_role: 'host',
      viewer_key: viewerKey,
      payload: name || '',
    }).catch(() => {});

  return { holder, requests, giveTo, answer };
}