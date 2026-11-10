import { useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { MousePointerClick } from 'lucide-react';

export default function ControlCapture({ sessionId, stageRef, videoRef, role, onPoint, onInput }) {
  const surface = useRef(null);
  const queued = useRef(null);
  const frame = useRef(0);
  const report = useRef(onPoint);
  report.current = onPoint;
  const send = useRef(onInput);
  send.current = onInput;

  useEffect(() => {
    surface.current?.focus();
  }, []);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    []
  );

  const point = (clientX, clientY) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    const video = videoRef.current;
    const vw = video?.videoWidth || 16;
    const vh = video?.videoHeight || 9;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const width = vw * scale;
    const height = vh * scale;
    const left = rect.left + (rect.width - width) / 2;
    const top = rect.top + (rect.height - height) / 2;
    return {
      x: Math.min(Math.max((clientX - left) / width, 0), 1),
      y: Math.min(Math.max((clientY - top) / height, 0), 1),
    };
  };

  const push = (kind, extra = {}) => {
    // Straight to the sharing tab over the live channel: this is the AnyDesk-speed path.
    const delivered = send.current?.({ kind, ...extra });
    if (delivered) return;
    // A pointer position that has already been overtaken is worthless, so moves
    // only ever travel over the live channel — never through the slower queue.
    if (kind === 'move') return;
    return base44.entities.ControlInput.create({
      session_id: sessionId,
      kind,
      from_role: role,
      delivered: false,
      ...extra,
    }).catch(() => {});
  };

  /**
   * A mouse reports far more positions than a screen can show, and sending every
   * one of them queued moves that were already out of date — which is exactly what
   * makes a remote pointer trail behind. So positions are collected and the newest
   * is sent once per frame: nothing to catch up on, nothing sent stale.
   */
  const flush = () => {
    frame.current = 0;
    const at = queued.current;
    queued.current = null;
    if (!at) return;
    const mapped = point(at.clientX, at.clientY);
    if (!mapped) return;
    report.current?.({ kind: 'move', ...mapped });
    send.current?.({ kind: 'move', ...mapped });
  };

  const onMove = (event) => {
    event.stopPropagation();
    queued.current = { clientX: event.clientX, clientY: event.clientY };
    if (!frame.current) frame.current = requestAnimationFrame(flush);
  };

  const onClick = (event) => {
    event.stopPropagation();
    const at = point(event.clientX, event.clientY);
    if (!at) return;
    report.current?.({ kind: 'click', x: at.x, y: at.y });
    push('click', {
      ...at,
      payload: event.button === 2 ? 'right' : 'left',
    });
  };

  const onWheel = (event) => {
    const steps = Math.round(event.deltaY / 120) || (event.deltaY > 0 ? 1 : -1);
    push('scroll', { payload: String(Math.max(Math.min(steps, 10), -10)) });
  };

  const onKeyDown = (event) => {
    if (event.key === 'F11' || event.key === 'F12') return;
    event.preventDefault();
    const payload = {
      k: event.key,
      c: event.ctrlKey || event.metaKey,
      s: event.shiftKey,
      a: event.altKey,
    };
    push('key', { payload: JSON.stringify(payload) });
  };

  return (
    <div
      ref={surface}
      tabIndex={0}
      role="application"
      onPointerMove={onMove}
      onClick={onClick}
      onContextMenu={(event) => {
        event.preventDefault();
        onClick(event);
      }}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      className="absolute inset-0 z-20 cursor-crosshair outline-none ring-2 ring-inset ring-primary/40"
    >
      <span className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-background/85 px-3 py-1.5 text-[11px] text-foreground ring-1 ring-primary/40">
        <MousePointerClick className="h-3.5 w-3.5 text-primary" />
        You control this computer — click and type
      </span>
    </div>
  );
}