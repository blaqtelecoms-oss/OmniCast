import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Keyboard, MousePointerClick } from 'lucide-react';

// The cloud queue behind the live channel only knows these kinds. A drag or a double
// click is not queued when the channel is down — a click, a scroll and a single key
// still are, which is what keeps a slow link usable instead of silent.
const QUEUED = new Set(['click', 'scroll', 'key']);

const TAP_SLOP = 9; // how far a finger may wander and still count as a tap
const LONG_PRESS = 520; // a still finger for this long is a right click
const DOUBLE_TAP = 320; // two taps closer than this are one double click
const SCROLL_STEP = 26; // two fingers travelling this far is one wheel notch
// A flick keeps the page moving after the fingers lift: the velocity the gesture
// ended at is carried and eased out one notch at a time, the way a local page
// coasts. Below this speed (pixels per millisecond) it has come to rest.
const GLIDE_MIN = 0.08;
const GLIDE_FRICTION = 0.92; // per sixtieth of a second
const GLIDE_GAIN = 0.7; // a wheel notch is coarser than a touch pixel, so a little less carries over
const CURSOR_IDLE = 1400; // the predicted cursor hides after this long still
const SPECIAL_KEYS = [
  'Enter',
  'Backspace',
  'Tab',
  'Escape',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
];

export default function ControlCapture({
  sessionId,
  stageRef,
  videoRef,
  role,
  onPoint,
  onInput,
  // A full screen view draws its own controls over the picture, so these keep the
  // hint and the keyboard button clear of those bars instead of under them.
  hintTop = 12,
  controlBottom = 12,
}) {
  const surface = useRef(null);
  const typing = useRef(null);
  const queued = useRef(null);
  const frame = useRef(0);
  const wheelPile = useRef(0);
  // The post-flick scroll: its own animation frame, speed and leftover travel.
  const glide = useRef({ raf: 0, velocity: 0, carried: 0, at: 0 });
  // The cursor drawn on this device, moved by hand rather than through React so
  // it follows a finger at the speed the screen refreshes.
  const cursor = useRef(null);
  const cursorTimer = useRef(0);
  const report = useRef(onPoint);
  report.current = onPoint;
  const send = useRef(onInput);
  send.current = onInput;
  const [typingOpen, setTypingOpen] = useState(false);
  const [touchy] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches)
  );

  // One gesture at a time is tracked here: where it started, whether it has become a
  // drag, whether the long press already turned it into a right click, and — with a
  // second finger down — where the scroll started from.
  const gesture = useRef({
    pointers: new Map(),
    start: null,
    downAt: 0,
    dragging: false,
    held: false,
    longTimer: 0,
    scrollAnchor: 0,
    // Set once two fingers have really scrolled, so the release coasts instead of
    // clicking, and so the speed below is measured from the last stretch of travel.
    scrolled: false,
    scrollVel: 0,
    scrollLastY: 0,
    scrollLastAt: 0,
    lastTap: 0,
    lastTapX: 0,
    lastTapY: 0,
  });

  useEffect(() => {
    surface.current?.focus();
  }, []);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      if (glide.current.raf) cancelAnimationFrame(glide.current.raf);
      clearTimeout(gesture.current.longTimer);
      clearTimeout(cursorTimer.current);
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
    if (kind === 'move' || !QUEUED.has(kind)) return;
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

  const queueMove = (clientX, clientY) => {
    queued.current = { clientX, clientY };
    if (!frame.current) frame.current = requestAnimationFrame(flush);
  };

  const stopGlide = () => {
    if (glide.current.raf) cancelAnimationFrame(glide.current.raf);
    glide.current.raf = 0;
    glide.current.velocity = 0;
    glide.current.carried = 0;
  };

  /**
   * Momentum. The speed the fingers left at is turned into wheel notches whose
   * spacing widens as it slows, so the remote page keeps gliding and settles
   * instead of stopping dead the moment the finger lifts — the clearest tell that
   * a screen is not local.
   */
  const startGlide = (velocity) => {
    stopGlide();
    if (Math.abs(velocity) < GLIDE_MIN) return;
    const state = glide.current;
    state.velocity = velocity * GLIDE_GAIN; // px per millisecond, sign is finger travel
    state.carried = 0;
    state.at = performance.now();
    const step = (now) => {
      state.raf = 0;
      const dt = Math.min(48, Math.max(1, now - state.at));
      state.at = now;
      state.velocity *= Math.pow(GLIDE_FRICTION, dt / 16.7);
      if (Math.abs(state.velocity) < GLIDE_MIN) return;
      state.carried += state.velocity * dt;
      if (Math.abs(state.carried) >= SCROLL_STEP) {
        const direction = Math.sign(state.carried);
        state.carried -= direction * SCROLL_STEP;
        // Screen coordinates grow downwards, wheel notches grow upwards.
        push('scroll', { payload: String(-direction) });
      }
      state.raf = requestAnimationFrame(step);
    };
    state.raf = requestAnimationFrame(step);
  };

  /**
   * The predicted cursor: drawn here, at the finger, with no round trip. The
   * remote pointer still reports where the computer thinks it is, but the dot a
   * person aims with is never behind the picture.
   */
  const paintCursor = (event) => {
    if (event.pointerType === 'mouse') return; // the real pointer already shows
    const node = cursor.current;
    const host = surface.current;
    if (!node || !host) return;
    const rect = host.getBoundingClientRect();
    node.style.transform = `translate3d(${Math.round(event.clientX - rect.left)}px, ${Math.round(
      event.clientY - rect.top
    )}px, 0)`;
    node.style.opacity = '1';
    clearTimeout(cursorTimer.current);
    cursorTimer.current = setTimeout(() => {
      if (cursor.current) cursor.current.style.opacity = '0';
    }, CURSOR_IDLE);
  };

  const endDrag = () => {
    const state = gesture.current;
    if (!state.dragging) return;
    state.dragging = false;
    push('up', { payload: 'left' });
  };

  /**
   * A phone reports touches, a desktop reports a wheel, and a trackpad reports a
   * stream of tiny wheel steps. All three are turned into whole notches here, and
   * leftover travel is kept so nothing is lost between events.
   */
  const onWheel = (event) => {
    event.stopPropagation();
    const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 100;
    wheelPile.current += event.deltaY;
    const steps = Math.trunc(wheelPile.current / unit);
    if (!steps) return;
    wheelPile.current -= steps * unit;
    push('scroll', { payload: String(Math.max(Math.min(steps, 12), -12)) });
  };

  // While typing, the transparent field covers the picture so a tap focuses it
  // instead of clicking the remote desktop. Those events must not reach a gesture.
  const onTypingField = (event) => event.target === typing.current;

  const onPointerDown = (event) => {
    event.stopPropagation();
    if (onTypingField(event)) return;
    const state = gesture.current;
    // A finger landing on a page that is still coasting stops it, exactly as it
    // would on a phone.
    stopGlide();
    paintCursor(event);
    try {
      surface.current?.setPointerCapture?.(event.pointerId);
    } catch (err) {
      /* a browser that cannot capture still reports the pointer while it is down */
    }
    state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (state.pointers.size === 1) {
      state.start = { x: event.clientX, y: event.clientY };
      state.downAt = Date.now();
      state.dragging = false;
      state.held = false;
      state.scrolled = false;
      clearTimeout(state.longTimer);
      // A right click on a phone is a press that does not move. The whole gesture is
      // then finished: waiting for the release would land a left click as well. A
      // mouse never needs this — it has a right button, and holding it is a drag.
      if (event.pointerType !== 'mouse') {
        state.longTimer = setTimeout(() => {
          const live = gesture.current;
          if (live.pointers.size !== 1 || live.dragging || !live.start) return;
          const at = point(live.start.x, live.start.y);
          if (!at) return;
          live.held = true;
          push('click', { ...at, payload: 'right' });
        }, LONG_PRESS);
      }
      return;
    }

    // A second finger means a scroll: nothing about the first finger may become a
    // click or a drag any more.
    clearTimeout(state.longTimer);
    state.held = true;
    endDrag();
    const points = [...state.pointers.values()];
    const ys = points.map((item) => item.y);
    state.scrollAnchor = ys.reduce((sum, y) => sum + y, 0) / ys.length;
    // Where the flick starts from, and how fast it is already going.
    state.scrolled = false;
    state.scrollVel = 0;
    state.scrollLastY = state.scrollAnchor;
    state.scrollLastAt = performance.now();
    // The wheel always turns under the pointer, so it is placed where the fingers
    // are first: scrolling then moves the window the person is actually looking at.
    const at = point(
      points.reduce((sum, item) => sum + item.x, 0) / points.length,
      state.scrollAnchor
    );
    if (at) {
      report.current?.({ kind: 'move', ...at });
      send.current?.({ kind: 'move', ...at });
    }
  };

  const onPointerMove = (event) => {
    event.stopPropagation();
    if (onTypingField(event)) return;
    paintCursor(event);
    const state = gesture.current;
    const known = state.pointers.get(event.pointerId);
    if (known) {
      known.x = event.clientX;
      known.y = event.clientY;
    }

    // Two fingers scroll. The notch is measured from how far they have travelled
    // together, so a slow drag scrolls a little and a flick scrolls a page.
    if (state.pointers.size >= 2) {
      const ys = [...state.pointers.values()].map((item) => item.y);
      const average = ys.reduce((sum, y) => sum + y, 0) / ys.length;
      const now = performance.now();
      const since = Math.max(1, now - state.scrollLastAt);
      // How fast the fingers are travelling together, smoothed so one jittery frame
      // does not decide how far the page coasts after the lift.
      state.scrollVel = state.scrollVel * 0.7 + ((average - state.scrollLastY) / since) * 0.3;
      state.scrollLastY = average;
      state.scrollLastAt = now;
      state.scrolled = true;
      const travel = average - state.scrollAnchor;
      if (Math.abs(travel) >= SCROLL_STEP) {
        const steps = Math.trunc(travel / SCROLL_STEP);
        state.scrollAnchor += steps * SCROLL_STEP;
        // Screen coordinates grow downwards while wheel notches grow upwards, so a
        // finger moving up the phone scrolls the page up.
        push('scroll', { payload: String(-Math.max(Math.min(steps, 6), -6)) });
      }
      return;
    }

    // No button down: a mouse moving over the picture is only a pointer position.
    if (!known) {
      queueMove(event.clientX, event.clientY);
      return;
    }
    if (!state.start) return;

    if (!state.dragging) {
      const moved = Math.hypot(event.clientX - state.start.x, event.clientY - state.start.y);
      if (moved < TAP_SLOP) return;
      // Past the slop a press is a drag with the left button held, which is what
      // selects text, moves windows and pulls a scrollbar.
      clearTimeout(state.longTimer);
      state.dragging = true;
      const from = point(state.start.x, state.start.y);
      if (from) push('down', { ...from, payload: 'left' });
    }
    queueMove(event.clientX, event.clientY);
  };

  const onPointerUp = (event) => {
    event.stopPropagation();
    if (onTypingField(event)) return;
    const state = gesture.current;
    if (!state.pointers.delete(event.pointerId)) return;
    clearTimeout(state.longTimer);

    // Lifting one of two fingers ends the scroll without clicking anything, and
    // keeps the page coasting at the speed the fingers were travelling.
    if (state.pointers.size) {
      endDrag();
      state.held = true;
      if (state.scrolled) {
        state.scrolled = false;
        startGlide(state.scrollVel);
      }
      return;
    }

    const at = point(event.clientX, event.clientY);
    const dragged = state.dragging;
    const held = state.held;
    const scrolled = state.scrolled;
    state.dragging = false;
    state.held = false;
    state.scrolled = false;
    state.start = null;

    // A scroll never clicks: the flick is handed to the glide and the gesture ends.
    if (scrolled) {
      startGlide(state.scrollVel);
      return;
    }

    if (dragged) {
      if (at) push('up', { ...at, payload: 'left' });
      return;
    }
    // The long press already sent its right click.
    if (held || !at) return;

    if (event.button === 2) {
      push('click', { ...at, payload: 'right' });
      return;
    }

    // Two taps close together in time and place are one double click, which is how
    // files, folders and shortcuts open on the computer being controlled.
    const now = Date.now();
    const close =
      Math.hypot(event.clientX - state.lastTapX, event.clientY - state.lastTapY) < 30;
    // A mouse already double-clicks by clicking twice, and doing both would press
    // three times on the remote desktop, so only a finger is turned into a double.
    if (event.pointerType !== 'mouse' && now - state.lastTap < DOUBLE_TAP && close) {
      state.lastTap = 0;
      push('double', { ...at, payload: 'left' });
      return;
    }
    state.lastTap = now;
    state.lastTapX = event.clientX;
    state.lastTapY = event.clientY;
    push('click', { ...at, payload: 'left' });
  };

  const onPointerCancel = (event) => {
    const state = gesture.current;
    state.pointers.delete(event.pointerId);
    clearTimeout(state.longTimer);
    endDrag();
    state.held = false;
    state.scrolled = false;
    if (!state.pointers.size) state.start = null;
  };

  const sendKey = (event) => {
    if (event.key === 'F11' || event.key === 'F12') return;
    // A phone keyboard inserts whole words instead of reporting presses, so typed
    // text travels as text (see onTyped). Only the keys a text field cannot deliver
    // itself are sent from here — sending the rest would type every letter twice.
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    const special = SPECIAL_KEYS.includes(event.key);
    if (!special && !modified) {
      // A keyboard on the surface itself (a desktop controlling a desktop): the
      // pressed letter is the whole event. Inside the typing field it would arrive
      // twice — once here and once as inserted text.
      if (event.currentTarget === typing.current || event.key.length !== 1) return;
    }
    event.preventDefault();
    const payload = {
      k: event.key,
      c: event.ctrlKey || event.metaKey,
      s: event.shiftKey,
      a: event.altKey,
    };
    push('key', { payload: JSON.stringify(payload) });
  };

  /**
   * A word is sent in one message instead of a key per character: a phone keyboard
   * inserts whole words, and each of those must not cost its own network round trip.
   * When the live channel is down the characters still go through one at a time.
   */
  const onTyped = (event) => {
    const typedText = event.currentTarget.value;
    if (!typedText) return;
    event.currentTarget.value = '';
    if (send.current?.({ kind: 'text', payload: typedText })) return;
    for (const char of typedText) push('key', { payload: JSON.stringify({ k: char }) });
  };

  return (
    <div
      ref={surface}
      tabIndex={0}
      role="application"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={onWheel}
      onKeyDown={sendKey}
      className="absolute inset-0 z-20 cursor-crosshair touch-none select-none outline-none ring-2 ring-inset ring-primary/40"
    >
      {/* The predicted cursor: painted on this device at the finger, so the dot a
          person aims with is never a round trip behind the picture. */}
      <span
        ref={cursor}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-10 opacity-0 transition-opacity duration-150"
      >
        <span className="relative block h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/80 bg-primary/20 shadow-[0_1px_6px_rgba(0,0,0,0.45)]">
          <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
        </span>
      </span>

      <span
        style={{ top: hintTop }}
        className="pointer-events-none absolute left-3 flex items-center gap-2 rounded-full bg-background/85 px-3 py-1.5 text-[11px] text-foreground ring-1 ring-primary/40"
      >
        <MousePointerClick className="h-3.5 w-3.5 text-primary" />
        {touchy ? 'Tap to click · hold to right-click · two fingers to scroll' : 'You control this computer — click, drag and type'}
      </span>

      {/* Transparent but real: a zero-sized or hidden field never brings up a phone
          keyboard, which is what left typing possible only from a desktop. */}
      <input
        ref={typing}
        aria-label="Type on the remote computer"
        onChange={onTyped}
        onKeyDown={sendKey}
        className={`absolute inset-0 h-full w-full bg-transparent text-transparent caret-transparent outline-none ${
          typingOpen ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
        style={{ opacity: 0, fontSize: 16 }}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          typing.current?.focus();
          setTypingOpen(true);
        }}
        style={{ bottom: controlBottom }}
        className="absolute right-3 z-30 flex items-center gap-1.5 rounded-full bg-background/85 px-3 py-1.5 text-[11px] text-foreground ring-1 ring-primary/40 transition-opacity hover:opacity-90"
      >
        <Keyboard className="h-3.5 w-3.5 text-primary" />
        {typingOpen ? 'Typing…' : 'Keyboard'}
      </button>
    </div>
  );
}
