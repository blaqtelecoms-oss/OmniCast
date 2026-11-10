const SHEBANG = /^#!.*\n/;

/**
 * Downloads the public helper and bakes this room's origin and pairing token
 * into it, so the person never has to type anything. The token is scoped to
 * this one session and stops working as soon as access is revoked.
 */
export async function buildHelperFile({ origin, token }) {
  const res = await fetch(`${origin}/omnicast-helper.mjs`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`helper fetch failed with HTTP ${res.status}`);
  const raw = await res.text();
  const source = raw.replace(SHEBANG, '');
  const args = [`--url=${origin}`, `--pair=${token}`];
  const prelude = `process.argv.push(${args.map((arg) => JSON.stringify(arg)).join(', ')});\n`;
  return prelude + source;
}

export function saveTextFile(name, text) {
  const blob = new Blob([text], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}