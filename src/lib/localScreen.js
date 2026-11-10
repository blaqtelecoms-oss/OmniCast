/**
 * Turns the screen the companion is capturing on this computer into a live
 * video stream for the page, so sharing needs no "pick a window" dialog and
 * keeps working when the tab is in the background.
 *
 * The companion answers on localhost with one JPEG per request; the frames are
 * painted onto a canvas, and the canvas itself becomes the published stream.
 */
const RELAY_PORTS = [47823, 47824, 47825, 47826, 47827];
// Ask for a frame often; the companion answers with whatever it has just
// captured, and a frame that did not change comes back as 304 without a decode.
const FRAME_GAP = 18;
// Probing has to be quick: the person just pressed a button and is waiting.
const PROBE_TIMEOUT = 900;
// Wide enough that text on the shared screen stays readable on a phone, without
// pushing a 4K desktop's worth of pixels through the encoder every frame.
const MAX_WIDTH = 1920;
const QUALITY = 75;

const screenWidth = () => {
  const css = window.screen?.width || 1280;
  const ratio = window.devicePixelRatio || 1;
  return Math.min(MAX_WIDTH, Math.max(1280, Math.round(css * ratio)));
};

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
    return { bitmap: await createImageBitmap(blob), etag: res.headers.get('etag') || '' };
  } catch (err) {
    return { bitmap: null, etag };
  }
}

export default async function openLocalScreen(preferredPort) {
  const order = preferredPort
    ? [preferredPort, ...RELAY_PORTS.filter((port) => port !== preferredPort)]
    : RELAY_PORTS;

  // All ports are asked at once so a missing companion costs under a second
  // instead of several, which is what made the button look dead.
  const probes = await Promise.all(
    order.map((candidate) =>
      fetchFrame(candidate, { timeout: PROBE_TIMEOUT, width: screenWidth(), quality: QUALITY }).then((found) => ({
        candidate,
        ...found,
      }))
    )
  );
  const hit = probes.find((item) => item.bitmap);
  probes.forEach((item) => {
    if (item.bitmap && item !== hit && item.bitmap.close) item.bitmap.close();
  });
  if (!hit) return null;

  const port = hit.candidate;
  const first = hit.bitmap;

  const canvas = document.createElement('canvas');
  canvas.width = first.width;
  canvas.height = first.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(first, 0, 0);
  if (first.close) first.close();

  const stream = canvas.captureStream(30);
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

  // Two independent loops: one keeps asking the companion for a frame, the other
  // paints whatever arrived in step with the display. Drawing never waits on a
  // request, so a slow frame cannot stall the picture the viewer is looking at.
  let pending = null;
  let frameHandle = 0;
  let stopped = false;

  const render = () => {
    if (stopped) return;
    if (pending) {
      const bitmap = pending;
      pending = null;
      if (bitmap.width !== canvas.width || bitmap.height !== canvas.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      ctx.drawImage(bitmap, 0, 0);
      if (bitmap.close) bitmap.close();
    }
    frameHandle = requestAnimationFrame(render);
  };
  frameHandle = requestAnimationFrame(render);

  (async () => {
    const width = screenWidth();
    let etag = hit.etag || '';
    while (!stopped) {
      const began = Date.now();
      const next = await fetchFrame(port, { etag, width, quality: QUALITY });
      if (next.etag) etag = next.etag;
      const bitmap = next.bitmap;
      if (bitmap) {
        // Only the newest frame is worth painting — an older one has been overtaken.
        if (pending?.close) pending.close();
        pending = bitmap;
      }
      const pause = Math.max(0, FRAME_GAP - (Date.now() - began));
      if (pause) await new Promise((resolve) => setTimeout(resolve, pause));
    }
    cancelAnimationFrame(frameHandle);
    if (pending?.close) pending.close();
  })();

  return stream;
}
