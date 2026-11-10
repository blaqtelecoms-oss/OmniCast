#!/usr/bin/env node
// Copy this app's data out of Base44 and into the Supabase project.
//
// Repeatable and idempotent: it creates what is missing, upserts rows by their
// original id (so relationships survive and a re-run repairs rather than
// duplicates), and never deletes anything from the source backend.
//
//   node supabase/migrate.mjs              # schema + buckets + data + media + verify
//   node supabase/migrate.mjs --schema     # only the schema and buckets
//   node supabase/migrate.mjs --data       # only rows and media
//   node supabase/migrate.mjs --verify     # only the report
//
// Needs: SUPABASE_ACCESS_TOKEN, VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// BASE44_APP_ID, BASE44_ADMIN_TOKEN. The service-role key stays in this process.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const runAll = !args.has('--schema') && !args.has('--data') && !args.has('--verify');
const runSchema = runAll || args.has('--schema');
const runData = runAll || args.has('--data');
const runVerifyOnly = args.has('--verify');

const {
  SUPABASE_ACCESS_TOKEN,
  VITE_SUPABASE_URL: SB_URL,
  SUPABASE_SERVICE_ROLE_KEY: SB_KEY,
  BASE44_APP_ID: B44_APP,
  BASE44_ADMIN_TOKEN: B44_TOKEN,
} = process.env;

for (const [name, value] of Object.entries({
  SUPABASE_ACCESS_TOKEN,
  VITE_SUPABASE_URL: SB_URL,
  SUPABASE_SERVICE_ROLE_KEY: SB_KEY,
  BASE44_APP_ID: B44_APP,
  BASE44_ADMIN_TOKEN: B44_TOKEN,
})) {
  if (!value) {
    console.error(`missing ${name}`);
    process.exit(1);
  }
}

const SB_REF = new URL(SB_URL).hostname.split('.')[0];
const B44 = 'https://app.base44.com';

const BUCKETS = { image: 'beam-images', video: 'beam-videos' };
const BUCKET_NAMES = Object.values(BUCKETS).concat(['avatars', 'attachments']);

// Entity name in Base44 → table in Supabase, and the columns worth carrying.
const TABLES = [
  {
    entity: 'User',
    table: 'profiles',
    columns: ['id', 'email', 'full_name', 'role', 'omnicast_device_id', 'created_date', 'updated_date'],
  },
  {
    entity: 'BeamMedia',
    table: 'beam_media',
    columns: ['id', 'session_id', 'kind', 'file_uri', 'title', 'sender_name', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
  {
    entity: 'CastSession',
    table: 'cast_sessions',
    columns: ['id', 'code', 'mode', 'host_id', 'host_name', 'status', 'allow_pointing', 'viewer_count', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
  {
    entity: 'ControlInput',
    table: 'control_inputs',
    columns: ['id', 'session_id', 'kind', 'from_role', 'x', 'y', 'payload', 'delivered', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
  {
    entity: 'DeviceAgent',
    table: 'device_agents',
    columns: ['id', 'device_id', 'label', 'platform', 'os_detail', 'version', 'status', 'unattended_enabled', 'allow_pointer', 'allow_keyboard', 'allow_clipboard', 'last_seen', 'pair_secret', 'secret_hash', 'access_hash', 'failed_attempts', 'locked_until', 'readiness', 'readiness_note', 'capture_ready', 'input_ready', 'ready_at', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
  {
    entity: 'DeviceSession',
    table: 'device_sessions',
    columns: ['id', 'device_id', 'device_label', 'owner_id', 'session_id', 'code', 'kind', 'operator_id', 'operator_name', 'status', 'control_holder', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
  {
    entity: 'HelperDevice',
    table: 'helper_devices',
    columns: ['id', 'session_id', 'token', 'label', 'platform', 'owner_role', 'control_holder', 'status', 'last_seen', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
  {
    entity: 'HelperPing',
    table: 'helper_pings',
    columns: ['id', 'session_id', 'device_id', 'label', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
  {
    entity: 'RoomEvent',
    table: 'room_events',
    columns: ['id', 'session_id', 'kind', 'x', 'y', 'sender_name', 'text', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
  {
    entity: 'RoomMessage',
    table: 'room_messages',
    columns: ['id', 'session_id', 'sender_id', 'sender_name', 'text', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
  {
    entity: 'SessionSignal',
    table: 'session_signals',
    columns: ['id', 'session_id', 'kind', 'from_role', 'viewer_key', 'payload', 'created_date', 'updated_date', 'created_by_id', 'created_by', 'is_sample'],
  },
];

const report = { tables: {}, media: { copied: [], unavailable: [] }, errors: [] };

// ------------------------------------------------------------------ helpers --
const sb = (path, init = {}) =>
  fetch(`${SB_URL}${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      authorization: `Bearer ${SB_KEY}`,
      ...(init.headers || {}),
    },
  });

const b44 = (path) =>
  fetch(`${B44}${path}`, { headers: { authorization: `Bearer ${B44_TOKEN}` } });

async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${SB_REF}/database/query`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`SQL failed (${response.status}): ${(await response.text()).slice(0, 400)}`);
  return response.status === 204 ? null : response.json();
}

async function sourceRows(entity) {
  const rows = [];
  for (let skip = 0; ; skip += 1000) {
    const response = await b44(`/api/apps/${B44_APP}/entities/${entity}?limit=1000&skip=${skip}`);
    if (!response.ok) throw new Error(`${entity}: source read failed (${response.status})`);
    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function upsert(table, rows) {
  let written = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const response = await sb(`/rest/v1/${table}?on_conflict=id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) throw new Error(`${table}: insert failed (${response.status}) ${(await response.text()).slice(0, 300)}`);
    written += chunk.length;
  }
  return written;
}

// Every row carries the same keys (a missing value becomes null) because a bulk
// insert only accepts rows with an identical shape.
const pick = (row, columns) => {
  const out = {};
  for (const column of columns) out[column] = row[column] === undefined ? null : row[column];
  return out;
};

// ------------------------------------------------------------------- schema --
if (runSchema) {
  for (const file of ['schema.sql', 'storage.sql']) {
    const text = await readFile(join(here, file), 'utf8');
    await sql(text);
    console.log(`applied ${file}`);
  }
}

// --------------------------------------------------------------------- data --
async function linkAuthUsers(profiles) {
  // Profiles keep their Base44 id; each one is tied to a Supabase Auth account by
  // email so sign-in works for people who already used the app. No password is
  // set here — an account without one signs in through a reset or Google.
  const existing = new Map();
  for (let page = 1; ; page += 1) {
    const response = await sb(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!response.ok) throw new Error(`auth users list failed (${response.status})`);
    const body = await response.json();
    const users = body.users || [];
    for (const user of users) if (user.email) existing.set(user.email.toLowerCase(), user.id);
    if (users.length < 200) break;
  }

  let linked = 0;
  for (const profile of profiles) {
    if (!profile.email || profile.auth_user_id) continue;
    let authId = existing.get(profile.email.toLowerCase());
    if (!authId) {
      const created = await sb('/auth/v1/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: profile.email,
          email_confirm: true,
          user_metadata: { full_name: profile.full_name || '' },
        }),
      });
      if (!created.ok) {
        report.errors.push(`auth user ${profile.email}: ${(await created.text()).slice(0, 160)}`);
        continue;
      }
      authId = (await created.json()).id;
    }

    // Creating the account fires the signup trigger, which inserts a profile keyed
    // by the auth id. The migrated record keeps the person's original id (every
    // session and device row points at it), so that placeholder gives way to it.
    await sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(authId)}`, { method: 'DELETE' });

    const updated = await sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ auth_user_id: authId }),
    });
    if (!updated.ok) {
      report.errors.push(`link ${profile.email}: ${(await updated.text()).slice(0, 160)}`);
      continue;
    }
    profile.auth_user_id = authId;
    linked += 1;
  }
  return linked;
}

// Base44 serves a stored file at /files/<path> as a redirect to the object URL.
async function fetchSourceFile(fileUri) {
  const relative = fileUri.replace(/^mp\//, '');
  const response = await b44(`/api/apps/${B44_APP}/files/${relative}`);
  if (response.status !== 302) return null;
  const location = response.headers.get('location');
  if (!location) return null;
  const file = await fetch(new URL(location, B44));
  if (!file.ok) return null;
  return { bytes: Buffer.from(await file.arrayBuffer()), type: file.headers.get('content-type') || '' };
}

if (runData) {
  for (const { entity, table, columns } of TABLES) {
    const rows = await sourceRows(entity);
    const prepared = rows.map((row) => pick(row, columns));
    const written = await upsert(table, prepared);
    report.tables[table] = { source: rows.length, written };
    console.log(`${table}: ${written}/${rows.length}`);
    if (table === 'profiles') {
      const linked = await linkAuthUsers(prepared);
      console.log(`profiles: ${linked} linked to Supabase Auth accounts`);
    }
  }

  // Media: move the bytes into the private bucket for their category and repoint
  // the record at `bucket/path`. A file that cannot be read is reported, never
  // silently pointed at a location that does not exist.
  const media = await (await sb('/rest/v1/beam_media?select=id,kind,file_uri,created_by_id,session_id')).json();
  for (const item of media) {
    const [first] = String(item.file_uri || '').split('/');
    if (BUCKET_NAMES.includes(first)) {
      report.media.copied.push({ id: item.id, uri: item.file_uri, already: true });
      continue;
    }

    const file = await fetchSourceFile(item.file_uri);
    if (!file) {
      report.media.unavailable.push({ id: item.id, uri: item.file_uri, reason: 'source object not readable' });
      continue;
    }

    const bucket = BUCKETS[item.kind] || 'attachments';
    const folder = item.created_by_id || item.session_id || 'shared';
    const base = String(item.file_uri).split('/').pop().replace(/[^\w.\-]/g, '_');
    const path = `${folder}/${item.id}-${base}`;

    const upload = await sb(`/storage/v1/object/${bucket}/${path}`, {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: file.bytes,
    });
    if (!upload.ok) {
      report.media.unavailable.push({ id: item.id, uri: item.file_uri, reason: `upload failed ${upload.status}` });
      continue;
    }

    const uri = `${bucket}/${path}`;
    const updated = await sb(`/rest/v1/beam_media?id=eq.${encodeURIComponent(item.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ file_uri: uri }),
    });
    if (!updated.ok) {
      report.media.unavailable.push({ id: item.id, uri: item.file_uri, reason: `repoint failed ${updated.status}` });
      continue;
    }
    report.media.copied.push({ id: item.id, uri, bytes: file.bytes.length });
    console.log(`media ${item.id}: ${file.bytes.length} bytes -> ${bucket}`);
  }
}

// ------------------------------------------------------------------- verify --
if (runData || runVerifyOnly) {
  const counts = {};
  for (const { table, entity } of TABLES) {
    const source = entity === 'User' ? (await sourceRows('User')).length : (await sourceRows(entity)).length;
    const response = await sb(`/rest/v1/${table}?select=id`, {
      headers: { prefer: 'count=exact', range: '0-0' },
    });
    const range = response.headers.get('content-range') || '';
    const target = Number(range.split('/')[1] || 0);
    counts[table] = { source, target, match: source === target };
  }
  const objects = {};
  for (const bucket of BUCKET_NAMES) {
    const response = await sb(`/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit: 1000 }),
    });
    objects[bucket] = response.ok ? (await response.json()).length : `error ${response.status}`;
  }
  console.log(JSON.stringify({ counts, objects, media: report.media, errors: report.errors }, null, 1));
  const mismatch = Object.entries(counts).filter(([, value]) => !value.match);
  if (mismatch.length) {
    console.error('count mismatch:', mismatch.map(([table, v]) => `${table} ${v.source}->${v.target}`).join(', '));
    process.exitCode = 2;
  }
}
