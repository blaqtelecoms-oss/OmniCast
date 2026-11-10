import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { pageItems, safeSubscribe } from './signal';

export default function useBeamMedia(sessionId) {
  const [media, setMedia] = useState(null);
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    let stopped = false;

    const load = async () => {
      try {
        const items = await pageItems(
          base44.entities.BeamMedia.filter(
            { session_id: sessionId },
            { sort: '-created_date', limit: 1 }
          )
        );
        if (!stopped) setMedia(items[0] || null);
      } catch (err) {
        /* retried next tick */
      }
    };

    load();
    const unsubscribe = safeSubscribe(base44.entities.BeamMedia, () => load());
    const timer = setInterval(load, 4000);

    return () => {
      stopped = true;
      clearInterval(timer);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!media?.file_uri) {
      setSrc('');
      return;
    }
    let cancelled = false;
    setSrc('');
    base44.integrations.Core.CreateFileSignedUrl({ file_uri: media.file_uri, expires_in: 3600 })
      .then((res) => {
        if (!cancelled) setSrc(res.signed_url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [media?.id]);

  return { media, src };
}