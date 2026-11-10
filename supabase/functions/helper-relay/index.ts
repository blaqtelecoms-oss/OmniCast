// Helper relay — what a helper's computer polls while it is helping someone.
//
// Ported from the previous backend's helperRelay function: same token check, same
// response. Runs with the service-role key because the helper has no user
// session; the pairing token is its credential.

import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// Answers the browser's preflight and cross-origin calls from the app's own
// origin; the caller's credential is the pairing token in the body.
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
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) return json({ error: 'token is required' }, 400);

    const { data: devices, error } = await admin
      .from('helper_devices')
      .select('*')
      .eq('token', token)
      .order('created_date', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);

    const device = devices?.[0] || null;
    if (!device) return json({ error: 'pairing not recognised' }, 401);
    if (device.status === 'revoked') return json({ revoked: true, status: 'revoked' });

    if (body.ping) {
      await admin.from('helper_pings').insert({
        id: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
        session_id: device.session_id,
        device_id: device.id,
        label: device.label || 'computer',
        created_by_id: device.created_by_id,
      });
      await admin
        .from('helper_devices')
        .update({ status: 'connected', last_seen: new Date().toISOString() })
        .eq('id', device.id);
    }

    const canInject = Boolean(device.control_holder && device.control_holder !== device.owner_role);
    if (!canInject) {
      return json({ session_id: device.session_id, control: false, status: device.status });
    }

    const { data: pending, error: pendingError } = await admin
      .from('control_inputs')
      .select('*')
      .eq('session_id', device.session_id)
      .eq('delivered', false)
      .order('created_date', { ascending: true })
      .limit(60);
    if (pendingError) throw new Error(pendingError.message);

    const inputs = pending || [];
    if (inputs.length) {
      await admin
        .from('control_inputs')
        .update({ delivered: true })
        .in('id', inputs.map((item) => item.id));
    }

    return json({
      session_id: device.session_id,
      control: true,
      status: device.status,
      inputs,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
