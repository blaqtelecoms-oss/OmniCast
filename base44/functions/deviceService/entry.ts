import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { createHash, randomBytes, scryptSync } from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ONLINE_WINDOW = 150000;
const LOCK_AFTER = 6;
const LOCK_MINUTES = 5;

const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(String(password), salt, 32).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

function passwordMatches(password, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, salt, digest] = stored.split('$');
  if (!salt || !digest) return false;
  const derived = scryptSync(String(password), salt, 32).toString('hex');
  return derived === digest;
}

const makeCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

const isFresh = (record) =>
  Boolean(record?.last_seen) && Date.now() - new Date(record.last_seen).getTime() < ONLINE_WINDOW;

const READINESS = ['ready', 'input-only', 'needs-permission', 'unsupported', 'unknown'];

/**
 * What the computer itself reported it can do. Only the companion knows whether
 * its capture and input actually work, and only these four values are trusted.
 */
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

async function findDevice(db, deviceId) {
  const found = await db.DeviceAgent.filter({ device_id: String(deviceId) }, { sort: '-created_date', limit: 1 });
  return found?.items?.[0] || null;
}

async function freeDeviceId(db, wanted) {
  const digits = String(wanted || '').replace(/\D/g, '').slice(0, 9);
  if (digits.length === 9 && !(await findDevice(db, digits))) return digits;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = String(Math.floor(100000000 + Math.random() * 900000000));
    if (!(await findDevice(db, candidate))) return candidate;
  }
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

async function uniqueCode(db) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = makeCode();
    const live = await db.CastSession.filter({ code, status: 'live' }, { limit: 1 });
    if (!live?.items?.length) return code;
  }
  return makeCode();
}

export default async function (req) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === 'string' ? body.action : '';
    if (!action) return Response.json({ error: 'action is required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    if (action === 'register') {
      const recordId = typeof body?.id === 'string' ? body.id : '';
      const pairSecret = typeof body?.pair_secret === 'string' ? body.pair_secret : '';
      if (!recordId || !pairSecret) return Response.json({ error: 'pairing details missing' }, { status: 400 });

      const record = await db.DeviceAgent.get(recordId).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
      if (!record) return Response.json({ error: 'pairing not recognised' }, { status: 401 });
      if (!record.pair_secret || record.pair_secret !== pairSecret) {
        return Response.json({ error: 'this pairing was already used or removed' }, { status: 401 });
      }
      if (record.status === 'revoked') return Response.json({ revoked: true, status: 'revoked' });

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

      return Response.json({ device_id: record.device_id, secret });
    }

    if (action === 'poll') {
      const deviceId = typeof body?.device_id === 'string' ? body.device_id : '';
      const secret = typeof body?.secret === 'string' ? body.secret : '';
      if (!deviceId || !secret) return Response.json({ error: 'device_id and secret are required' }, { status: 400 });

      const recordId = typeof body?.id === 'string' ? body.id : '';
      const device = recordId
        ? await db.DeviceAgent.get(recordId).catch((e) => (e.status === 404 ? null : Promise.reject(e)))
        : await findDevice(db, deviceId);
      if (!device || device.device_id !== deviceId || !device.secret_hash || device.secret_hash !== sha256(secret)) {
        return Response.json({ error: 'device not recognised' }, { status: 401 });
      }
      if (device.status === 'revoked') return Response.json({ revoked: true, status: 'revoked' });

      if (body?.ping) {
        await db.DeviceAgent.update(device.id, {
          status: 'online',
          last_seen: new Date().toISOString(),
          ...readinessPatch(body),
        });
      }

      const sessions = await db.DeviceSession.filter(
        { device_id: device.device_id, status: { $in: ['pending', 'active'] } },
        { sort: '-created_date', limit: 10 }
      );
      const current = sessions.items || [];
      const session = current.find((item) => item.status === 'active') || null;
      let inputs = [];
      if (session && session.control_holder === 'operator' && !body?.local_relay) {
        // Only recent input: a click queued before control was handed over must not fire later.
        const since = new Date(Date.now() - 15000).toISOString();
        const queued = await db.ControlInput.filter(
          { session_id: session.session_id, delivered: false, created_date: { $gt: since } },
          { sort: 'created_date', limit: 60 }
        );
        inputs = queued?.items || [];
        if (inputs.length) {
          await db.ControlInput.bulkUpdate(inputs.map((item) => ({ id: item.id, delivered: true })));
        }
      }

      return Response.json({
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
        requests: current.filter((item) => item.status === 'pending').slice(0, 3).map((item) => ({ id: item.id, operator_name: item.operator_name, code: item.code })),
        inputs,
      });
    }

    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // A companion that lost its record (removed, or set up under another account)
    // is paired again from the browser: this mints a fresh record for the person
    // signed in, keeping the number the computer already shows when it is free.
    if (action === 'claim') {
      const wanted = typeof body?.device_id === 'string' ? body.device_id.replace(/\D/g, '').slice(0, 9) : '';
      const leftover = wanted ? await findDevice(db, wanted) : null;
      // A number still sitting on a record that never finished pairing (downloads
      // that were never opened) is handed over as it is, so the same number is not
      // left behind and the computer keeps the one it shows.
      // The number belongs to the computer, not to one pairing: when the record is
      // this person's own (or was never finished), it is re-armed with a fresh
      // single-use secret instead of the computer being given a different number.
      const mine = Boolean(leftover) && leftover.created_by_id === user.id;
      const unused = Boolean(leftover) && !leftover.secret_hash;
      if (leftover && leftover.status !== 'revoked' && (mine || unused)) {
        const nextSecret = randomBytes(24).toString('hex');
        await db.DeviceAgent.update(leftover.id, {
          created_by_id: user.id,
          label: typeof body?.label === 'string' && body.label ? body.label.slice(0, 120) : leftover.label,
          status: 'pairing',
          secret_hash: '',
          pair_secret: nextSecret,
        });
        return Response.json({
          record_id: leftover.id,
          device_id: leftover.device_id,
          pair_secret: nextSecret,
          transferred: true,
        });
      }
      const deviceId = await freeDeviceId(db, body?.device_id);
      const pairSecret = randomBytes(24).toString('hex');
      const platform = ['windows', 'macos', 'linux'].includes(String(body?.platform))
        ? String(body.platform)
        : 'windows';
      const record = await base44.entities.DeviceAgent.create({
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
      });
      return Response.json({ record_id: record.id, device_id: deviceId, pair_secret: pairSecret });
    }

    if (action === 'set-unattended') {
      const device = await findDevice(db, body?.device_id);
      if (!device || device.created_by_id !== user.id) {
        return Response.json({ error: 'That device is not yours.' }, { status: 403 });
      }
      if (!isFresh(device)) {
        return Response.json(
          { error: 'The companion is not running on that computer right now, so this change was not saved.' },
          { status: 409 }
        );
      }

      const enabled = Boolean(body?.enabled);
      const password = typeof body?.password === 'string' ? body.password : '';
      if (enabled && password && password.length < 6) {
        return Response.json({ error: 'Use at least six characters for the access password.' }, { status: 400 });
      }
      if (enabled && !password && !device.access_hash) {
        return Response.json({ error: 'Set a password to turn unattended access on.' }, { status: 400 });
      }

      const patch = {
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
      return Response.json({ ok: true, unattended_enabled: enabled });
    }

    if (action === 'connect') {
      const device = await findDevice(db, body?.device_id);
      if (!device) return Response.json({ error: 'No device has that ID.' }, { status: 404 });
      if (device.status === 'revoked') return Response.json({ error: 'That device was removed.' }, { status: 403 });
      if (!isFresh(device)) {
        return Response.json({ error: 'That computer is offline right now.' }, { status: 409 });
      }
      if (device.locked_until && new Date(device.locked_until).getTime() > Date.now()) {
        return Response.json({ error: 'Too many wrong passwords. Try again in a few minutes.' }, { status: 429 });
      }

      const wantsUnattended = Boolean(device.unattended_enabled && device.access_hash);
      const password = typeof body?.password === 'string' ? body.password : '';
      let kind = 'attended';
      let status = 'pending';

      if (wantsUnattended && password) {
        if (!passwordMatches(password, device.access_hash)) {
          const attempts = Number(device.failed_attempts || 0) + 1;
          const patch = { failed_attempts: attempts };
          if (attempts >= LOCK_AFTER) {
            patch.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
            patch.failed_attempts = 0;
          }
          await db.DeviceAgent.update(device.id, patch);
          return Response.json({ error: 'That password is not right for this device.' }, { status: 403 });
        }
        kind = 'unattended';
        status = 'active';
      }

      const code = await uniqueCode(db);
      const cast = await db.CastSession.create({
        code,
        mode: 'help',
        host_id: device.created_by_id,
        host_name: device.label || 'Device',
        status: 'live',
        allow_pointing: true,
      });

      const record = await db.DeviceSession.create({
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
      });

      return Response.json({
        device_session_id: record.id,
        session_id: cast.id,
        code,
        pending: status === 'pending',
      });
    }

    if (action === 'answer') {
      const record = await db.DeviceSession.get(body?.device_session_id).catch((e) =>
        e.status === 404 ? null : Promise.reject(e)
      );
      if (!record) return Response.json({ error: 'That request is gone.' }, { status: 404 });
      if (record.owner_id !== user.id) {
        return Response.json({ error: 'Only the owner of that computer can answer.' }, { status: 403 });
      }
      const accept = Boolean(body?.accept);
      await db.DeviceSession.update(record.id, {
        status: accept ? 'active' : 'declined',
        control_holder: accept ? 'operator' : 'owner',
      });
      if (!accept) {
        await db.CastSession.update(record.session_id, { status: 'ended' }).catch(() => {});
      }
      return Response.json({ ok: true, status: accept ? 'active' : 'declined' });
    }

    if (action === 'end') {
      const record = await db.DeviceSession.get(body?.device_session_id).catch((e) =>
        e.status === 404 ? null : Promise.reject(e)
      );
      if (!record) return Response.json({ error: 'That session is gone.' }, { status: 404 });
      const allowed = record.owner_id === user.id || record.operator_id === user.id;
      if (!allowed) return Response.json({ error: 'Not your session.' }, { status: 403 });
      await db.DeviceSession.update(record.id, { status: 'ended', control_holder: 'owner' });
      await db.CastSession.update(record.session_id, { status: 'ended' }).catch(() => {});
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    const rateLimited = error.status === 429 || error.response?.status === 429;
    return Response.json({ error: error.message }, {
      status: rateLimited ? 429 : 500,
      ...(rateLimited ? { headers: { 'Retry-After': '60' } } : {}),
    });
  }
}