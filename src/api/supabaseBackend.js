import { supabase, mediaBucket } from './supabaseClient';

// The app's data, auth, functions and media, served by Supabase.
//
// The pages and hooks call `base44.entities…`, `base44.auth…` and so on; this
// module implements exactly that surface on top of Supabase so the UI and its
// behaviour stay as they are while the backend underneath is the new project.
// Nothing here holds a privileged key: row level security answers every request
// as the signed-in person.

const TABLES = {
  BeamMedia: 'beam_media',
  CastSession: 'cast_sessions',
  ControlInput: 'control_inputs',
  DeviceAgent: 'device_agents',
  DeviceSession: 'device_sessions',
  HelperDevice: 'helper_devices',
  HelperPing: 'helper_pings',
  RoomEvent: 'room_events',
  RoomMessage: 'room_messages',
  SessionSignal: 'session_signals',
  User: 'profiles',
};

const FUNCTION_SLUGS = {
  deviceService: 'device-service',
  helperRelay: 'helper-relay',
};

const BUCKETS = ['beam-images', 'beam-videos', 'avatars', 'attachments'];

const httpError = (message, status) => Object.assign(new Error(message), { status });

// ------------------------------------------------------------------ profiles --
let profileCache;

async function loadProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session?.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('auth_user_id', session.user.id)
    .maybeSingle();
  if (error) throw httpError(error.message, error.code === 'PGRST301' ? 401 : 500);

  const profile = data || {
    id: session.user.id,
    auth_user_id: session.user.id,
    email: session.user.email,
    full_name: session.user.user_metadata?.full_name || '',
    role: 'user',
  };

  return {
    ...profile,
    auth_id: session.user.id,
    email: profile.email || session.user.email,
  };
}

async function profileId() {
  if (profileCache === undefined) profileCache = (await loadProfile())?.id || null;
  return profileCache;
}

// Every page, room and device screen asks who is signed in, and each answer was a
// whole round trip to the database. The same person is answered from here for a
// short while instead, and simultaneous asks share one request.
let meMemo = null;
let mePending = null;
const ME_TTL = 30000;

function forgetMe() {
  meMemo = null;
  mePending = null;
}

async function currentUser() {
  if (meMemo && Date.now() - meMemo.at < ME_TTL) return meMemo.value;
  if (mePending) return mePending;
  mePending = (async () => {
    const profile = await loadProfile();
    if (!profile) throw httpError('Authentication required', 401);
    profileCache = profile.id;
    meMemo = { value: profile, at: Date.now() };
    return profile;
  })();
  try {
    return await mePending;
  } finally {
    mePending = null;
  }
}

// ------------------------------------------------------------------- queries --
function applyFilters(builder, query) {
  for (const [field, condition] of Object.entries(query || {})) {
    if (condition === null || condition === undefined) {
      builder = builder.is(field, null);
    } else if (typeof condition === 'object' && !Array.isArray(condition)) {
      for (const [operator, value] of Object.entries(condition)) {
        if (operator === '$in') builder = builder.in(field, value);
        else if (operator === '$nin') builder = builder.not(field, 'in', `(${value.map((v) => JSON.stringify(v)).join(',')})`);
        else if (operator === '$ne') builder = builder.neq(field, value);
        else if (operator === '$gt') builder = builder.gt(field, value);
        else if (operator === '$gte') builder = builder.gte(field, value);
        else if (operator === '$lt') builder = builder.lt(field, value);
        else if (operator === '$lte') builder = builder.lte(field, value);
        else if (operator === '$exists') builder = value ? builder.not(field, 'is', null) : builder.is(field, null);
      }
    } else {
      builder = builder.eq(field, condition);
    }
  }
  return builder;
}

function applyOrder(builder, sort) {
  const spec = sort || '-created_date';
  for (const part of String(spec).split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const descending = trimmed.startsWith('-');
    builder = builder.order(trimmed.replace(/^[-+]/, ''), { ascending: !descending });
  }
  return builder;
}

function entity(table) {
  const query = (columns = '*') => supabase.from(table).select(columns);

  return {
    // filter({...}, { sort, limit }) — the shape every hook expects.
    async filter(filters = {}, options = {}) {
      let builder = applyFilters(query(), filters);
      builder = applyOrder(builder, options.sort);
      if (options.limit) builder = builder.limit(options.limit);
      if (options.skip) builder = builder.range(options.skip, options.skip + (options.limit || 1000) - 1);
      const { data, error } = await builder;
      if (error) throw httpError(error.message, 500);
      return data || [];
    },

    async get(id) {
      const { data, error } = await query().eq('id', id).maybeSingle();
      if (error) throw httpError(error.message, 500);
      if (!data) throw httpError('Not found', 404);
      return data;
    },

    async create(values) {
      const owner = await profileId();
      // These tables keep the original Base44 ids: text, with no database
      // default, so a new record is given one here.
      const row = { id: crypto.randomUUID(), ...values };
      if (owner && row.created_by_id === undefined) row.created_by_id = owner;
      const { data, error } = await supabase.from(table).insert(row).select('*').single();
      if (error) throw httpError(error.message, 500);
      return data;
    },

    async update(id, values) {
      const { data, error } = await supabase.from(table).update(values).eq('id', id).select('*').maybeSingle();
      if (error) throw httpError(error.message, 500);
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw httpError(error.message, 500);
      return { id };
    },

    async deleteMany(filters = {}) {
      let builder = supabase.from(table).delete();
      builder = applyFilters(builder, filters);
      const { error } = await builder;
      if (error) throw httpError(error.message, 500);
      return { ok: true };
    },

    async bulkUpdate(records) {
      const updated = [];
      for (const record of records) {
        const { id, ...values } = record;
        if (!id) continue;
        const { data, error } = await supabase.from(table).update(values).eq('id', id).select('*').maybeSingle();
        if (error) throw httpError(error.message, 500);
        if (data) updated.push(data);
      }
      return updated;
    },

    // Live updates for the room views. Returns the unsubscribe the callers keep.
    subscribe(onEvent) {
      const channel = supabase
        .channel(`${table}:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
          onEvent({ type: payload.eventType, data: payload.new || payload.old });
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    },
  };
}

const entities = {};
for (const [name, table] of Object.entries(TABLES)) entities[name] = entity(table);

// ---------------------------------------------------------------------- auth --
const auth = {
  async me() {
    return currentUser();
  },

  // Flows that finish with a token from another step land here; the Supabase
  // session is already established by then, so this only refreshes the cache.
  setToken() {
    profileCache = undefined;
    forgetMe();
  },

  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw httpError(error.message, error.status || 400);
    profileCache = undefined;
    forgetMe();
    return { access_token: data.session?.access_token, user: data.user };
  },

  async register({ email, password }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) throw httpError(error.message, error.status || 400);
    profileCache = undefined;
    forgetMe();
    return { access_token: data.session?.access_token || null, user: data.user, confirmation_required: !data.session };
  },

  async verifyOtp({ email, otpCode }) {
    for (const type of ['signup', 'email']) {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: otpCode, type });
      if (!error) {
        profileCache = undefined;
        forgetMe();
        return { access_token: data.session?.access_token || null, user: data.user };
      }
    }
    throw httpError('Invalid verification code', 400);
  },

  async resendOtp(email) {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) throw httpError(error.message, 400);
    return { ok: true };
  },

  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw httpError(error.message, 400);
    return { ok: true };
  },

  // The recovery link signs the person in, so the new password is applied to
  // that session; an older reset token is no longer needed.
  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw httpError(error.message, 400);
    return { ok: true };
  },

  async updateMe(values) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user) throw httpError('Authentication required', 401);
    const { data, error } = await supabase
      .from('profiles')
      .update(values)
      .eq('auth_user_id', sessionData.session.user.id)
      .select('*')
      .maybeSingle();
    if (error) throw httpError(error.message, 500);
    // The page reads this person again straight away (device number, name), so the
    // memo is refreshed with what the database has just stored.
    if (data) meMemo = { value: { ...data, auth_id: data.auth_user_id }, at: Date.now() };
    return data;
  },

  async loginWithProvider(provider, returnTo) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${returnTo || '/'}` },
    });
    if (error) throw httpError(error.message, 400);
    return { ok: true };
  },

  async logout(fromUrl) {
    profileCache = undefined;
    forgetMe();
    await supabase.auth.signOut();
    if (fromUrl) window.location.assign(fromUrl);
  },

  redirectToLogin(fromUrl) {
    const target = fromUrl && new URL(fromUrl, window.location.origin).pathname;
    const search = target && target !== '/' ? `?returnTo=${encodeURIComponent(target)}` : '';
    window.location.assign(`/login${search}`);
  },
};

// ----------------------------------------------------------------- functions --
const functions = {
  // Same call shape as before: `{ data }` with the function's JSON response, so
  // the callers that read `res.data.error` keep working.
  async invoke(name, body) {
    const slug = FUNCTION_SLUGS[name] || name;
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(sessionData?.session?.access_token
          ? { authorization: `Bearer ${sessionData.session.access_token}` }
          : {}),
      },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    return { data: payload, status: response.status };
  },
};

// -------------------------------------------------------------- file storage --
const integrations = {
  Core: {
    // Uploads land in the private bucket for their category, under the person's
    // own folder; the returned reference is `<bucket>/<path>`.
    async UploadPrivateFile({ file }) {
      const owner = await profileId();
      if (!owner) throw httpError('Authentication required', 401);
      const kind = String(file?.type || '').startsWith('video/')
        ? 'video'
        : String(file?.type || '').startsWith('image/')
          ? 'image'
          : 'file';
      const bucket = kind === 'file' ? 'attachments' : mediaBucket(kind);
      const safeName = String(file?.name || 'upload').replace(/[^\w.\-]/g, '_');
      const path = `${owner}/${Date.now()}-${safeName}`;

      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file?.type || 'application/octet-stream',
        upsert: false,
      });
      if (error) throw httpError(error.message, 400);
      return { file_uri: `${bucket}/${path}` };
    },

    async CreateFileSignedUrl({ file_uri: fileUri, expires_in: expiresIn = 3600 }) {
      const [bucket, ...rest] = String(fileUri || '').split('/');
      if (!BUCKETS.includes(bucket) || rest.length === 0) {
        // A file still held by the previous backend cannot be signed here.
        throw httpError('This file is still stored on the previous backend', 404);
      }
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(rest.join('/'), expiresIn);
      if (error) throw httpError(error.message, 400);
      return { signed_url: data.signedUrl };
    },
  },
};

export const base44 = {
  entities,
  auth,
  functions,
  integrations,
  app: {
    // Everything the app needs about itself is now its Supabase project, which
    // the client already knows; this keeps the startup check working.
    async getPublicSettings() {
      return { id: import.meta.env.VITE_SUPABASE_URL, public_settings: {} };
    },
  },
};
