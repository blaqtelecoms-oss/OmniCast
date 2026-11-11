/**
 * Turns the screen the companion is capturing on this computer into a live
 * video stream for the page, so sharing needs no "pick a window" dialog and
 * keeps working when the tab is in the background.
 *
 * The companion answers on localhost with one JPEG per request; the frames are
 * painted onto a canvas, and the canvas itself becomes the published stream.
 */
const RELAY_PORTS = [47823, 47824, 47825, 47826, 47827];
// A frame is asked for the moment the last one is painted, and the companion holds
// the request until the desktop has actually changed. These two numbers are the
// floor between two starts (sixty a second at best) and the pause after a frame
// that did not change, so a still desktop never spins the CPU.
const FRAME_GAP = 10;
const MIN_FRAME_GAP = 16;
// Probing has to be generous: on Windows the helper's first grab allocates its
// bitmaps, and giving up after a blink is what dropped sharing back to a browser
// window picker that shows nothing in a preview pane.
const PROBE_TIMEOUT = 1500;
const PROBE_ROUNDS = 2;
// The shared screen is captured at the size the person watching can actually show,
// up to 4K, so every pixel survives the encoder instead of being scaled down again.
const MAX_WIDTH = 3840;
const MIN_WIDTH = 1280;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const screenWidth = () => {
  const css = window.screen?.width || 1280;
  const ratio = window.devicePixelRatio || 1;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(css * ratio)));
};

// A small picture can afford the sharpest JPEG the helper can make; at 4K the same
// quality would cost more encode time per frame than it is worth.
const qualityFor = (width) => (width >= 3000 ? 84 : 90);

/**
 * A JPEG has no alpha and needs no colour conversion, so both are turned off: every
 * conversion here is another full-frame copy between the decode and the paint.
 */
async function decode(blob) {
  try {
    return await createImageBitmap(blob, {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
      imageOrientation: 'none',
    });
  } catch (err) {
    return createImageBitmap(blob);
  }
}

async function fetchFrame(port, { timeout = 3000, etag = '', width = 0, quality = 0 } = {}) {
  const query = new URLSearchParams({ t: String(Date.now()) });
  if (width) query.set('w', String(width));
  if (quality) query.set('q', String(quality));
  try {
    const res = await fetch(`http://127.0.0.1:${port}/frame?${query.toString()}`, {
      cache: 'no-store',
      headers: etag ? { 'If-None-Match': etag } : undefined,
      signal: AbortSignal.timeout(timeout),
    });
    if (res.status === 304) return { bitmap: null, etag };
    if (!res.ok) return { bitmap: null, etag };
    const type = res.headers.get('content-type') || '';
    if (!type.includes('image')) return { bitmap: null, etag };
    const blob = await res.blob();
    if (!blob.size) return { bitmap: null, etag };
    return { bitmap: await decode(blob), etag: res.headers.get('etag') || '' };
  } catch (err) {
    return { bitmap: null, etag };
  }
}

export default async function openLocalScreen(preferredPort) {
  const order = preferredPort
    ? [preferredPort, ...RELAY_PORTS.filter((port) => port !== preferredPort)]
    : RELAY_PORTS;

  // The width the picture is captured at. The viewer sets it to what its own screen
  // shows (see SharePublisher), so a phone never receives a 4K desktop it would have
  // to shrink again — and the encoder never has to shrink it either.
  let targetWidth = screenWidth();
  // How crisp the grab is. Left alone it follows the width; the adaptive bitrate
  // loop lowers it while the link is struggling so the frame rate survives.
  let targetQuality = 0;
  const quality = () => targetQuality || qualityFor(targetWidth);

  // All ports are asked at once so a missing companion costs under a second
  // instead of several, which is what made the button look dead.
  const probeOnce = async () => {
    const probes = await Promise.all(
      order.map((candidate) =>
        fetchFrame(candidate, {
          timeout: PROBE_TIMEOUT,
          width: targetWidth,
          quality: quality(),
        }).then((found) => ({
          candidate,
          ...found,
        }))
      )
    );
    const found = probes.find((item) => item.bitmap);
    probes.forEach((item) => {
      if (item.bitmap && item !== found && item.bitmap.close) item.bitmap.close();
    });
    return found || null;
  };

  // A companion that has just started is still building its first frame, so a
  // second look is taken before deciding it is not there at all.
  let hit = await probeOnce();
  for (let round = 1; !hit && round < PROBE_ROUNDS; round += 1) {
    await sleep(500);
    hit = await probeOnce();
  }
  if (!hit) return null;

  const port = hit.candidate;
  const first = hit.bitmap;
  let stopped = false;

  const canvas = document.createElement('canvas');
  canvas.width = first.width;
  canvas.height = first.height;
  // `desynchronized` lets the browser hand the paint to the compositor without a
  // scheduled flush, which is what takes the last few milliseconds of latency out
  // of the path between a decoded frame and the encoder.
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  ctx.drawImage(first, 0, 0);
  if (first.close) first.close();

  // Sixty as the ceiling: the canvas is only painted when a new frame actually
  // arrives, and the sender profile caps what leaves this computer.
  const stream = canvas.captureStream(60);
  const track = stream.getVideoTracks()[0];
  if (track) {
    // Tell the encoder this is a screen, not a webcam: it keeps text edges sharp
    // instead of softening the picture to save bits.
    try {
      track.contentHint = 'text';
    } catch (err) {
      /* this browser keeps its own default */
    }
    track.addEventListener('ended', () => {
      stopped = true;
    });
  }

  // Frames are painted the instant they arrive, and the next one is asked for
  // straight away. No animation frame and no timer is involved: the companion holds
  // the request until it has a newer picture, so the pace comes from the capture
  // itself. Painting from an animation frame is what left the shared screen black —
  // a browser stops firing those the moment this tab is not in front, which is
  // exactly the situation when someone remotes in from their phone.
  const paint = (bitmap) => {
    if (bitmap.width !== canvas.width || bitmap.height !== canvas.height) {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
    }
    ctx.drawImage(bitmap, 0, 0);
    if (bitmap.close) bitmap.close();
  };

  (async () => {
    let etag = hit.etag || '';
    while (!stopped) {
      const began = Date.now();
      const width = targetWidth;
      const next = await fetchFrame(port, { etag, width, quality: quality() });
      if (next.etag) etag = next.etag;
      // Painted the instant it arrives, then the next one is asked for.
      if (next.bitmap) paint(next.bitmap);
      // A fresh frame is followed by the next request at once, so the picture runs as
      // fast as the companion can grab — up to sixty a second. Nothing new (the
      // desktop has not changed) waits briefly rather than asking flat out.
      const pause = next.bitmap
        ? Math.max(0, MIN_FRAME_GAP - (Date.now() - began))
        : FRAME_GAP;
      if (pause) await sleep(pause);
    }
  })();

  /**
   * The viewer says how many pixels it actually shows, and the capture follows. A
   * phone asking for 1600 px wide instead of a full 4K desktop is the difference
   * between text that can be read and text the encoder has smeared — the same
   * bandwidth buys far more detail per pixel.
   */
  const setWidth = (value) => {
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(Number(value) || 0)));
    if (!next || next === targetWidth) return;
    targetWidth = next;
  };

  /**
   * The adaptive bitrate loop asks for a smaller grab while the link is tight.
   * Resolution never changes here — only how much detail each frame carries.
   */
  const setQuality = (value) => {
    const next = Math.round(Number(value) || 0);
    targetQuality = next ? Math.min(95, Math.max(45, next)) : 0;
  };

  return { stream, setWidth, setQuality };
}
