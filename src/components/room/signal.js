import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function randomKey() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function waitForIce(pc, timeout = 2500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      pc.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    pc.addEventListener('icegatheringstatechange', onChange);
    setTimeout(finish, timeout);
  });
}

export function safeSubscribe(entity, onEvent) {
  try {
    const unsubscribe = entity.subscribe(onEvent);
    return typeof unsubscribe === 'function' ? unsubscribe : () => {};
  } catch (err) {
    return () => {};
  }
}

export async function pageItems(query) {
  const result = await query;
  return Array.isArray(result) ? result : result?.items || [];
}

export function useSignalInbox(sessionId, onRecord) {
  const seen = useRef(new Set());
  const handler = useRef(onRecord);
  handler.current = onRecord;

  useEffect(() => {
    if (!sessionId) return;
    seen.current = new Set();
    let stopped = false;

    const handle = (rec) => {
      if (!rec || rec.session_id !== sessionId) return;
      if (seen.current.has(rec.id)) return;
      seen.current.add(rec.id);
      handler.current(rec);
    };

    const unsubscribe = safeSubscribe(base44.entities.SessionSignal, (event) => {
      if (event?.type === 'create') handle(event.data);
    });

    (async () => {
      while (!stopped) {
        try {
          const items = await pageItems(
            base44.entities.SessionSignal.filter(
              { session_id: sessionId },
              { sort: '-created_date', limit: 40 }
            )
          );
          items.forEach(handle);
        } catch (err) {
          /* transient network hiccup — next tick retries */
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    })();

    return () => {
      stopped = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [sessionId]);
}