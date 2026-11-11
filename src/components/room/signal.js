import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function randomKey() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Candidates arrive within a few hundred milliseconds on a normal connection, and
// waiting the full window when they do not is pure delay before the picture starts.
export function waitForIce(pc, timeout = 1200) {
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

/**
 * Live updates arrive by themselves; this also asks the table on a timer so a
 * dropped realtime message can never strand a connection. `pollMs` is how often
 * that ask happens: short while something is still being set up, longer once the
 * two sides are talking.
 */
export function useSignalInbox(sessionId, onRecord, pollMs = 2000) {
  const seen = useRef(new Set());
  const handler = useRef(onRecord);
  handler.current = onRecord;

  // Cleared only when the session changes. The poll interval is switched while a
  // connection is still being set up, and re-reading the last signals then would
  // hand back an offer that was already answered — which tore down a picture that
  // had just started and left the viewer staring at black.
  useEffect(() => {
    seen.current = new Set();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
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
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    })();

    return () => {
      stopped = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [sessionId, pollMs]);
}