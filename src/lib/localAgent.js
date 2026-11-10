/**
 * Asks the companion running on this computer which device it is.
 *
 * The installed companion answers on localhost for any browser on the machine,
 * so the Devices page recognises "this computer" again after a new sign-in, in
 * a different browser, or when the browser profile was wiped. It also reports
 * the nine-digit number it paired as, which is how the number still shows up
 * after the device was removed from the account.
 *
 * Every port is asked at once: a companion left over from an older install still
 * holds some of them, and the one that is actually paired wins over a stale one.
 */
const RELAY_PORTS = [47823, 47824, 47825, 47826, 47827];

async function ask(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/whoami`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data?.record_id) return null;
    return {
      recordId: String(data.record_id),
      deviceId: data.device_id ? String(data.device_id) : '',
      platform: data.platform ? String(data.platform) : '',
      label: data.label ? String(data.label) : '',
      paired: data.paired !== false,
      port,
      capture: Boolean(data.capture),
      version: data.version ? String(data.version) : '',
      // The companion hands this out only on localhost, so holding it proves the
      // request came from this computer — no token has to survive the URL.
      token: data.claim_token ? String(data.claim_token) : '',
      // While a connection waits, the companion shows a six-digit PIN on this
      // computer; reading it here is what lets this screen display it too.
      pairing:
        data.pairing && data.pairing.pin
          ? {
              sessionId: String(data.pairing.session_id || ''),
              pin: String(data.pairing.pin),
              expiresAt: String(data.pairing.expires_at || ''),
              operator: String(data.pairing.operator || ''),
            }
          : null,
    };
  } catch (err) {
    return null;
  }
}

export async function findLocalDevice() {
  const answers = await Promise.all(RELAY_PORTS.map((port) => ask(port)));
  const found = answers.filter(Boolean);
  return found.find((item) => item.paired) || found[0] || null;
}