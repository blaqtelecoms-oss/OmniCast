import { useEffect, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * Expands the person's own view of a session to the whole screen. Browsers only
 * allow this from a click, so it is a button; leaving through the browser's own
 * full screen key keeps the icon in step because the state is read back.
 */
export default function FullscreenButton({ targetRef }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(document.fullscreenElement === targetRef.current);
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [targetRef]);

  const toggle = async () => {
    try {
      if (document.fullscreenElement === targetRef.current) await document.exitFullscreen();
      else await targetRef.current?.requestFullscreen?.();
    } catch (err) {
      /* the browser refused — the normal layout stays as it is */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={active ? 'Exit full screen' : 'Full screen'}
      title={active ? 'Exit full screen' : 'Full screen'}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:text-foreground"
    >
      {active ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}