import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

export default async function (req) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

    const base44 = createClientFromRequest(req);
    const db = base44.asServiceRole.entities;

    const devices = await db.HelperDevice.filter({ token }, { sort: '-created_date', limit: 1 });
    const device = devices?.items?.[0] || null;
    if (!device) return Response.json({ error: 'pairing not recognised' }, { status: 401 });
    if (device.status === 'revoked') return Response.json({ revoked: true, status: 'revoked' });

    if (body.ping) {
      await db.HelperPing.create({
        session_id: device.session_id,
        device_id: device.id,
        label: device.label || 'computer',
      });
      await db.HelperDevice.update(device.id, {
        status: 'connected',
        last_seen: new Date().toISOString(),
      });
    }

    const canInject = Boolean(
      device.control_holder && device.control_holder !== device.owner_role
    );
    if (!canInject) {
      return Response.json({ session_id: device.session_id, control: false, status: device.status });
    }

    const pending = await db.ControlInput.filter(
      { session_id: device.session_id, delivered: false },
      { sort: 'created_date', limit: 60 }
    );
    const inputs = pending?.items || [];
    if (inputs.length) {
      await db.ControlInput.bulkUpdate(
        inputs.map((item) => ({ id: item.id, delivered: true }))
      );
    }

    return Response.json({
      session_id: device.session_id,
      control: true,
      status: device.status,
      inputs,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}