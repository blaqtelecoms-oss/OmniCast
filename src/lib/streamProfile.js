/**
 * The real-time profile every remote desktop connection runs on.
 *
 * A remote screen is not a video: a frame is only worth something until the next
 * one, and a click is only worth something immediately. So the sender keeps the
 * resolution it was given (text stays sharp), runs at up to sixty frames, and
 * gives up bitrate — not frames and not detail — when the link tightens.
 */

export const FRAME_RATE = 60;

// What the encoder may spend. The ceiling is what a 4K desktop needs to keep text
// readable; the floor is where a picture stops being worth showing at all.
export const BITRATE = {
  min: 1_800_000,
  start: 14_000_000,
  max: 22_000_000,
};

// JPEG quality the companion is asked for, per link condition. A clean link gets
// the crispest grab; a struggling one gets a smaller picture to encode, which is
// how the frame rate is protected without touching the resolution.
export const CAPTURE_QUALITY = { sharp: 90, medium: 80, lean: 68 };

/**
 * Applies the real-time sender profile to one video sender and reports whether
 * it took. Resolution is pinned and the degradation preference keeps the encoder
 * from answering a tight link by shrinking the picture.
 */
export async function applyRealtimeSender(sender, maxBitrate = BITRATE.start) {
  if (!sender) return false;
  // Only the picture is tuned: an audio sender has none of these settings.
  if (sender.track && sender.track.kind !== 'video') return false;
  try {
    if (sender.track) sender.track.contentHint = 'text';
  } catch (err) {
    /* this browser keeps its own default */
  }

  const build = (withPriority) => {
    const params = sender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];
    const encoding = params.encodings[0];
    encoding.maxBitrate = Math.round(maxBitrate);
    encoding.maxFramerate = FRAME_RATE;
    encoding.scaleResolutionDownBy = 1;
    if (withPriority) {
      // Ask the transport to schedule this stream ahead of anything else on the
      // connection. Browsers that do not know the field reject the whole set, so
      // it is dropped and applied again below.
      encoding.priority = 'high';
      encoding.networkPriority = 'high';
    }
    params.degradationPreference = 'maintain-resolution';
    return params;
  };

  try {
    await sender.setParameters(build(true));
    return true;
  } catch (err) {
    try {
      await sender.setParameters(build(false));
      return true;
    } catch (err2) {
      return false;
    }
  }
}

/**
 * Watches what the link can actually carry and moves the encoder with it.
 *
 * The ceiling is what this connection has proved it can handle: it climbs while
 * the encoder is not being held back, and drops the moment the browser says the
 * link is the limit. The bitrate target then follows the transport's own estimate,
 * and the capture quality follows the target — so congestion costs sharpness, not
 * frames, and a clean link climbs back to a crisp 4K picture on its own.
 */
export function startAdaptiveStream(sender, { onQuality, every = 1200 } = {}) {
  let stopped = false;
  let ceiling = BITRATE.start;
  let current = BITRATE.start;
  let level = 'sharp';
  let timer = 0;

  const read = async () => {
    const stats = await sender.getStats();
    let out = null;
    let link = null;
    stats.forEach((report) => {
      if (report.type === 'outbound-rtp' && report.kind === 'video' && !report.isRemote) out = report;
      if (
        report.type === 'candidate-pair' &&
        (report.nominated || report.state === 'succeeded') &&
        Number(report.availableOutgoingBitrate)
      ) {
        link = report;
      }
    });
    return { out, link };
  };

  const step = async () => {
    try {
      const { out, link } = await read();
      const available = Number(link?.availableOutgoingBitrate) || 0;
      const limited = out?.qualityLimitationReason || 'none';

      if (limited === 'bandwidth') ceiling = Math.max(BITRATE.min, ceiling * 0.7);
      else if (limited === 'none') ceiling = Math.min(BITRATE.max, ceiling * 1.1);

      let target = ceiling;
      if (available > 0) {
        target = Math.min(ceiling, Math.max(BITRATE.min, available * 0.85));
      }
      if (limited === 'bandwidth') target = Math.max(BITRATE.min, target * 0.75);

      // Only moved when the change is worth it: every setParameters restarts the
      // rate controller and costs a key frame.
      if (Math.abs(target - current) > Math.max(400_000, current * 0.15)) {
        current = target;
        await applyRealtimeSender(sender, target);
      }

      const share = current / BITRATE.max;
      const next = share < 0.35 ? 'lean' : share < 0.65 ? 'medium' : 'sharp';
      if (next !== level) {
        level = next;
        onQuality?.(CAPTURE_QUALITY[next]);
      }
    } catch (err) {
      /* a connection that has closed reports nothing — the loop is stopped with it */
    }
    if (!stopped) timer = setTimeout(step, every);
  };

  applyRealtimeSender(sender, current).catch(() => {});
  timer = setTimeout(step, every);

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
