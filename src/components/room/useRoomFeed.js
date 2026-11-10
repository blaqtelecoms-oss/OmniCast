import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { pageItems, safeSubscribe } from './signal';

export function useRoomEvents(sessionId, onEvent) {
  const seen = useRef(new Set());
  const handler = useRef(onEvent);
  handler.current = onEvent;

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

    const unsubscribe = safeSubscribe(base44.entities.RoomEvent, (event) => {
      if (event?.type === 'create') handle(event.data);
    });

    (async () => {
      while (!stopped) {
        try {
          const items = await pageItems(
            base44.entities.RoomEvent.filter(
              { session_id: sessionId },
              { sort: '-created_date', limit: 20 }
            )
          );
          items.forEach(handle);
        } catch (err) {
          /* retried next tick */
        }
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }
    })();

    return () => {
      stopped = true;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [sessionId]);
}

export function useRoomMessages(sessionId) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    const load = async () => {
      try {
        const items = await pageItems(
          base44.entities.RoomMessage.filter(
            { session_id: sessionId },
            { sort: '-created_date', limit: 60 }
          )
        );
        if (!stopped) setMessages([...items].reverse());
      } catch (err) {
        /* retried next tick */
      }
    };

    load();
    const unsubscribe = safeSubscribe(base44.entities.RoomMessage, () => load());
    const timer = setInterval(load, 3000);

    return () => {
      stopped = true;
      clearInterval(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [sessionId]);

  return messages;
}