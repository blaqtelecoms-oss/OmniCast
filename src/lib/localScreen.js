/**
 * Turns the screen the companion is capturing on this computer into a live
 * video stream for the page, so sharing needs no "pick a window" dialog and
 * keeps working when the tab is in the background.
 *
 * The companion answers on localhost with one JPEG per request; the frames are
 * painted onto a canvas, and the canvas itself becomes the published stream.
 */
const RELAY_PORTS = [47823, 47824, 47825, 47826, 47827];
// About 25 frames a second: below this a moving cursor on the shared screen
// visibly crawls, which reads as "remote control is slow" even when the click
// itself lands instantly.
const FRAME_GAP = 38;
// Probing has to be quick: the person just pressed a button and is waiting.
const PROBE_TIMEOUT = 900;

async function fetchFrame(port, timeout = 3000) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/frame?t=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.includes('image')) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return await createImageBitmap(blob);
  } catch (err) {
    return null;
  }
}

export default async function openLocalScreen(preferredPort) {
  const order = preferredPort
    ? [preferredPort, ...RELAY_PORTS.filter((port) => port !== preferredPort)]
    : RELAY_PORTS;

  // All ports are asked at once so a missing companion costs under a second
  // instead of several, which is what made the button look dead.
  const probes = await Promise.all(
    order.map((candidate) => fetchFrame(candidate, PROBE_TIMEOUT).then((bitmap) => ({ candidate, bitmap })))
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
  let stopped = false;
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    stopped = true;
  });

  // Two independent loops: one keeps asking the companion for a frame, the other
  // paints whatever arrived in step with the display. Drawing never waits on a
  // request, so a slow frame cannot stall the picture the viewer is looking at.
  let pending = null;
  let frameHandle = 0;

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

  // Requests stay paced: the companion grabs a fresh screenshot per request, so
  // asking without a gap raises its CPU cost instead of raising the frame rate.
  (async () => {
    while (!stopped) {
      const began = Date.now();
      const bitmap = await fetchFrame(port);
      if (bitmap) {
        // Only the newest frame is worth painting — an older one has been overtaken.
        if (pending?.close) pending.close();
        pending = bitmap;
      }
      const pause = Math.max(0, FRAME_GAP - (Date.now() - began));
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
    cancelAnimationFrame(frameHandle);
    if (pending?.close) pending.close();
  })();

  return stream;
}