// Device service — the relay the desktop companion talks to.
//
// Ported from the previous backend's deviceService function: same actions, same
// responses. It runs as a Supabase Edge Function with the service-role key (the
// companion has no user session yet when it registers), and the browser actions
// are attributed to the signed-in person found from the request's token.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHash, randomBytes, scryptSync } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ONLINE_WINDOW = 150000;
const LOCK_AFTER = 6;
const LOCK_MINUTES = 5;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const sha256 = (value: string) => createHash('sha256').update(String(value)).digest('hex');

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

function passwordMatches(password: string, stored: string) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, salt, digest] = stored.split('$');
  if (!salt || !digest) return false;
  return scryptSync(String(password), salt, 32).toString('hex') === digest;
}

const makeCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

const isFresh = (record: any) =>
  Boolean(record?.last_seen) && Date.now() - new Date(record.last_seen).getTime() < ONLINE_WINDOW;

const READINESS = ['ready', 'input-only', 'needs-permission', 'unsupported', 'unknown'];

function readinessPatch(body: any) {
  const caps = body?.capabilities;
  if (!caps || typeof caps !== 'object') return {};
  return {
    capture_ready: Boolean(caps.capture),
    input_ready: Boolean(caps.input),
    readiness: READINESS.includes(String(caps.readiness)) ? String(caps.readiness) : 'unknown',
    readiness_note: typeof caps.reason === 'string' ? caps.reason.slice(0, 300) : '',
    ready_at: new Date().toISOString(),
  };
}

const notFound = () => Object.assign(new Error('Not found'), { status: 404 });

// The entity calls the original function made, expressed against the tables.
function table(name: string) {
  const apply = (filters: Record<string, any>) => {
    let builder: any = admin.from(name).select('*');
    for (const [field, condition] of Object.entries(filters || {})) {
      if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
        for (const [operator, value] of Object.entries(condition)) {
          if (operator === '$in') builder = builder.in(field, value);
          else if (operator === '$ne') builder = builder.neq(field, value);
          else if (operator === '$gt') builder = builder.gt(field, value);
          else if (operator === '$gte') builder = builder.gte(field, value);
          else if (operator === '$lt') builder = builder.lt(field, value);
          else if (operator === '$lte') builder = builder.lte(field, value);
        }
      } else if (condition === null || condition === undefined) {
        builder = builder.is(field, null);
      } else {
        builder = builder.eq(field, condition);
      }
    }
    return builder;
  };

  return {
    async filter(filters: Record<string, any> = {}, options: { sort?: string; limit?: number } = {}) {
      let builder = apply(filters);
      for (const part of String(options.sort || '-created_date').split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        builder = builder.order(trimmed.replace(/^[-+]/, ''), { ascending: !trimmed.startsWith('-') });
      }
      if (options.limit) builder = builder.limit(options.limit);
      const { data, error } = await builder;
      if (error) throw new Error(error.message);
      return { items: data || [] };
    },

    async get(id: string) {
      const { data, error } = await admin.from(name).select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw notFound();
      return data;
    },

    async create(values: Record<string, any>) {
      const { data, error } = await admin.from(name).insert(values).select('*').single();
      if (error) throw new Error(error.message);
      return data;
    },

    async update(id: string, values: Record<string, any>) {
      const { data, error } = await admin.from(name).update(values).eq('id', id).select('*').maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },

    async bulkUpdate(records: Array<Record<string, any>>) {
      for (const record of records) {
        const { id, ...values } = record;
        if (!id) continue;
        const { error } = await admin.from(name).update(values).eq('id', id);
        if (error) throw new Error(error.message);
      }
    },
  };
}

const db = {
  DeviceAgent: table('device_agents'),
  DeviceSession: table('device_sessions'),
  CastSession: table('cast_sessions'),
  ControlInput: table('control_inputs'),
  HelperDevice: table('helper_devices'),
};

async function findDevice(deviceId: unknown) {
  const found = await db.DeviceAgent.filter({ device_id: String(deviceId) }, { sort: '-created_date', limit: 1 });
  return found.items[0] || null;
}

async function freeDeviceId(wanted: unknown) {
  const digits = String(wanted || '').replace(/\D/g, '').slice(0, 9);
  if (digits.length === 9 && !(await findDevice(digits))) return digits;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = String(Math.floor(100000000 + Math.random() * 900000000));
    if (!(await findDevice(candidate))) return candidate;
  }
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeCode();
    const live = await db.CastSession.filter({ code, status: 'live' }, { limit: 1 });
    if (!live.items.length) return code;
  }
  return makeCode();
}

// The person a request is signed in as: the profile row behind the bearer token.
async function currentUser(req: Request) {
  const header = req.headers.get('authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('auth_user_id', data.user.id)
    .maybeSingle();
  if (profile) return { ...profile, email: profile.email || data.user.email };
  return { id: data.user.id, auth_user_id: data.user.id, email: data.user.email, full_name: '', role: 'user' };
}

// The browser calls this function from the app's own origin (the page is not
// served from the Supabase domain), so every answer has to allow that origin —
// including the OPTIONS preflight the browser sends first because of the
// apikey/authorization headers. Credentials are a bearer token, never a cookie,
// so a wildcard origin grants no more than each action's own checks do.
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
  'access-control-max-age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : '';
    if (!action) return json({ error: 'action is required' }, 400);

    if (action === 'register') {
      const recordId = typeof body?.id === 'string' ? body.id : '';
      const pairSecret = typeof body?.pair_secret === 'string' ? body.pair_secret : '';
      if (!recordId || !pairSecret) return json({ error: 'pairing details missing' }, 400);

      const record = await db.DeviceAgent.get(recordId).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
      if (!record) return json({ error: 'pairing not recognised' }, 401);
      if (!record.pair_secret || record.pair_secret !== pairSecret) {
        return json({ error: 'this pairing was already used or removed' }, 401);
      }
      if (record.status === 'revoked') return json({ revoked: true, status: 'revoked' });

      const secret = randomBytes(24).toString('hex');
      await db.DeviceAgent.update(record.id, {
        secret_hash: sha256(secret),
        pair_secret: '',
        status: 'online',
        last_seen: new Date().toISOString(),
        label: body?.label || record.label,
        platform: body?.platform || record.platform,
        os_detail: body?.os_detail || record.os_detail || '',
        version: body?.version || record.version || '1.0.0',
        ...readinessPatch(body),
      });

      return json({ device_id: record.device_id, secret });
    }

    if (action === 'poll') {
      const deviceId = typeof body?.device_id === 'string' ? body.device_id : '';
      const secret = typeof body?.secret === 'string' ? body.secret : '';
      if (!deviceId || !secret) return json({ error: 'device_id and secret are required' }, 400);

      const recordId = typeof body?.id === 'string' ? body.id : '';
      const device = recordId
        ? await db.DeviceAgent.get(recordId).catch((e) => (e.status === 404 ? null : Promise.reject(e)))
        : await findDevice(deviceId);
      if (!device || device.device_id !== deviceId || !device.secret_hash || device.secret_hash !== sha256(secret)) {
        return json({ error: 'device not recognised' }, 401);
      }
      if (device.status === 'revoked') return json({ revoked: true, status: 'revoked' });

      if (body?.ping) {
        await db.DeviceAgent.update(device.id, {
          status: 'online',
          last_seen: new Date().toISOString(),
          ...readinessPatch(body),
        });
      }

      const sessions = await db.DeviceSession.filter(
        { device_id: device.device_id, status: { $in: ['pending', 'active'] } },
        { sort: '-created_date', limit: 10 },
      );
      const current = sessions.items;
      const session = current.find((item) => item.status === 'active') || null;
      let inputs: any[] = [];
      if (session && session.control_holder === 'operator' && !body?.local_relay) {
        // Only recent input: a click queued before control was handed over must not fire later.
        const since = new Date(Date.now() - 15000).toISOString();
        const queued = await db.ControlInput.filter(
          { session_id: session.session_id, delivered: false, created_date: { $gt: since } },
          { sort: 'created_date', limit: 60 },
        );
        inputs = queued.items;
        if (inputs.length) await db.ControlInput.bulkUpdate(inputs.map((item) => ({ id: item.id, delivered: true })));
      }

      return json({
        status: 'online',
        record_id: device.id,
        device_id: device.device_id,
        device: {
          label: device.label,
          unattended_enabled: Boolean(device.unattended_enabled),
          allow_pointer: device.allow_pointer !== false,
          allow_keyboard: device.allow_keyboard !== false,
          allow_clipboard: Boolean(device.allow_clipboard),
        },
        session: session
          ? {
              id: session.id,
              session_id: session.session_id,
              code: session.code,
              kind: session.kind,
              control_holder: session.control_holder,
            }
          : null,
        requests: current
          .filter((item) => item.status === 'pending')
          .slice(0, 3)
          .map((item) => ({ id: item.id, operator_name: item.operator_name, code: item.code })),
        inputs,
      });
    }

    const user = await currentUser(req);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    if (action === 'claim') {
      const wanted = typeof body?.device_id === 'string' ? body.device_id.replace(/\D/g, '').slice(0, 9) : '';
      const leftover = wanted ? await findDevice(wanted) : null;
      const mine = Boolean(leftover) && leftover!.created_by_id === user.id;
      const unused = Boolean(leftover) && !leftover!.secret_hash;
      if (leftover && leftover.status !== 'revoked' && (mine || unused)) {
        const nextSecret = randomBytes(24).toString('hex');
        await db.DeviceAgent.update(leftover.id, {
          created_by_id: user.id,
          label: typeof body?.label === 'string' && body.label ? body.label.slice(0, 120) : leftover.label,
          status: 'pairing',
          secret_hash: '',
          pair_secret: nextSecret,
        });
        return json({
          record_id: leftover.id,
          device_id: leftover.device_id,
          pair_secret: nextSecret,
          transferred: true,
        });
      }
      const deviceId = await freeDeviceId(body?.device_id);
      const pairSecret = randomBytes(24).toString('hex');
      const platform = ['windows', 'macos', 'linux'].includes(String(body?.platform))
        ? String(body.platform)
        : 'windows';
      const record = await db.DeviceAgent.create({
        id: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
        device_id: deviceId,
        label: typeof body?.label === 'string' && body.label ? body.label.slice(0, 120) : 'This computer',
        platform,
        status: 'pairing',
        unattended_enabled: false,
        allow_pointer: true,
        allow_keyboard: true,
        allow_clipboard: false,
        pair_secret: pairSecret,
        version: '2.2.0',
        created_by_id: user.id,
        created_by: user.email || '',
      });
      return json({ record_id: record.id, device_id: deviceId, pair_secret: pairSecret });
    }

    if (action === 'set-unattended') {
      const device = await findDevice(body?.device_id);
      if (!device || device.created_by_id !== user.id) {
        return json({ error: 'That device is not yours.' }, 403);
      }
      if (!isFresh(device)) {
        return json(
          { error: 'The companion is not running on that computer right now, so this change was not saved.' },
          409,
        );
      }

      const enabled = Boolean(body?.enabled);
      const password = typeof body?.password === 'string' ? body.password : '';
      if (enabled && password && password.length < 6) {
        return json({ error: 'Use at least six characters for the access password.' }, 400);
      }
      if (enabled && !password && !device.access_hash) {
        return json({ error: 'Set a password to turn unattended access on.' }, 400);
      }

      const patch: Record<string, any> = {
        unattended_enabled: enabled,
        allow_pointer: body?.allow_pointer !== false,
        allow_keyboard: body?.allow_keyboard !== false,
        allow_clipboard: Boolean(body?.allow_clipboard),
        failed_attempts: 0,
        locked_until: '',
      };
      if (password) patch.access_hash = hashPassword(password);
      if (!enabled && body?.forget_password) patch.access_hash = '';

      await db.DeviceAgent.update(device.id, patch);
      return json({ ok: true, unattended_enabled: enabled });
    }

    if (action === 'connect') {
      const device = await findDevice(body?.device_id);
      if (!device) return json({ error: 'No device has that ID.' }, 404);
      if (device.status === 'revoked') return json({ error: 'That device was removed.' }, 403);
      if (!isFresh(device)) return json({ error: 'That computer is offline right now.' }, 409);
      if (device.locked_until && new Date(device.locked_until).getTime() > Date.now()) {
        return json({ error: 'Too many wrong passwords. Try again in a few minutes.' }, 429);
      }

      const wantsUnattended = Boolean(device.unattended_enabled && device.access_hash);
      const password = typeof body?.password === 'string' ? body.password : '';
      let kind = 'attended';
      let status = 'pending';

      if (wantsUnattended && password) {
        if (!passwordMatches(password, device.access_hash)) {
          const attempts = Number(device.failed_attempts || 0) + 1;
          const patch: Record<string, any> = { failed_attempts: attempts };
          if (attempts >= LOCK_AFTER) {
            patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
            patch.failed_attempts = 0;
          }
          await db.DeviceAgent.update(device.id, patch);
          return json({ error: 'That password is not right for this device.' }, 403);
        }
        kind = 'unattended';
        status = 'active';
      }

      const code = await uniqueCode();
      const castId = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      const cast = await db.CastSession.create({
        id: castId,
        code,
        mode: 'help',
        host_id: device.created_by_id,
        host_name: device.label || 'Device',
        status: 'live',
        allow_pointing: true,
        created_by_id: device.created_by_id,
      });

      const record = await db.DeviceSession.create({
        id: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
        device_id: device.device_id,
        device_label: device.label || 'Device',
        owner_id: device.created_by_id,
        session_id: cast.id,
        code,
        kind,
        operator_id: user.id,
        operator_name: user.full_name || user.email || 'Someone',
        status,
        control_holder: status === 'active' ? 'operator' : 'owner',
        created_by_id: user.id,
      });

      return json({
        device_session_id: record.id,
        session_id: cast.id,
        code,
        pending: status === 'pending',
      });
    }

    if (action === 'answer') {
      const record = await db.DeviceSession.get(body?.device_session_id).catch((e) =>
        e.status === 404 ? null : Promise.reject(e),
      );
      if (!record) return json({ error: 'That request is gone.' }, 404);
      if (record.owner_id !== user.id) {
        return json({ error: 'Only the owner of that computer can answer.' }, 403);
      }
      const accept = Boolean(body?.accept);
      await db.DeviceSession.update(record.id, {
        status: accept ? 'active' : 'declined',
        control_holder: accept ? 'operator' : 'owner',
      });
      if (!accept) {
        await db.CastSession.update(record.session_id, { status: 'ended' }).catch(() => {});
      }
      return json({ ok: true, status: accept ? 'active' : 'declined' });
    }

    if (action === 'end') {
      const record = await db.DeviceSession.get(body?.device_session_id).catch((e) =>
        e.status === 404 ? null : Promise.reject(e),
      );
      if (!record) return json({ error: 'That session is gone.' }, 404);
      const allowed = record.owner_id === user.id || record.operator_id === user.id;
      if (!allowed) return json({ error: 'Not your session.' }, 403);
      await db.DeviceSession.update(record.id, { status: 'ended', control_holder: 'owner' });
      await db.CastSession.update(record.session_id, { status: 'ended' }).catch(() => {});
      return json({ ok: true });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
