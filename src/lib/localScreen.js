/**
 * A companion agent running on this computer answers on localhost and hands
 * back a screen-capture stream. When no agent is installed the browser falls
 * back to its own picker, which is what most people use.
 */
export default async function openLocalScreen(port) {
  if (!port) return null;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) return null;
    const { sdp } = await response.json();
    if (!sdp) return null;

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    return new MediaStream(pc.getReceivers().map((receiver) => receiver.track).filter(Boolean));
  } catch {
    return null;
  }
}
