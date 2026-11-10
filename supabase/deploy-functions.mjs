#!/usr/bin/env node
// Deploy the app's backend functions to the Supabase project.
//
//   node supabase/deploy-functions.mjs
//
// Each directory under supabase/functions is one function. They are called by
// the desktop companion, which has no user session, so JWT verification is off
// and they authenticate the caller themselves (device secret, helper token).
// Needs SUPABASE_ACCESS_TOKEN and VITE_SUPABASE_URL.

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const { SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_URL } = process.env;

if (!SUPABASE_ACCESS_TOKEN || !VITE_SUPABASE_URL) {
  console.error('missing SUPABASE_ACCESS_TOKEN or VITE_SUPABASE_URL');
  process.exit(1);
}

const ref = new URL(VITE_SUPABASE_URL).hostname.split('.')[0];
const api = `https://api.supabase.com/v1/projects/${ref}/functions`;
const headers = {
  authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
  'content-type': 'application/json',
};

const deployed = await (await fetch(api, { headers })).json();
const existing = new Set((Array.isArray(deployed) ? deployed : []).map((fn) => fn.slug));

const functionsDir = join(here, 'functions');
const dirs = (await readdir(functionsDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const slug of dirs) {
  const body = await readFile(join(functionsDir, slug, 'index.ts'), 'utf8');
  const payload = JSON.stringify({ slug, name: slug, verify_jwt: false, body });

  const response = existing.has(slug)
    ? await fetch(`${api}/${slug}`, { method: 'PATCH', headers, body: payload })
    : await fetch(api, { method: 'POST', headers, body: payload });

  if (!response.ok) {
    console.error(`${slug}: deploy failed (${response.status}) ${(await response.text()).slice(0, 300)}`);
    process.exitCode = 1;
    continue;
  }
  console.log(`${slug}: deployed`);
}

const after = await (await fetch(api, { headers })).json();
console.log(
  'functions:',
  (Array.isArray(after) ? after : []).map((fn) => `${fn.slug}(${fn.status})`).join(', ') || 'none'
);
