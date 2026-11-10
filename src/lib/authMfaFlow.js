import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';

// Two-factor authentication against Supabase Auth.
//
// The sign-in and settings screens keep the session-shaped API they already use
// (verify, setupAuthenticator, confirmAuthenticator, status, removeMethod).
// Supabase supports authenticator-app factors; text-message codes need an SMS
// provider that this project does not have yet, so those calls say so plainly.

export class MfaError extends Error {
  constructor(message, status, retryAfter) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }

  get mustSignInAgain() {
    return this.status === 401;
  }
}

const unavailable = (what) =>
  new MfaError(`${what} is not available on the new backend yet. Use an authenticator app instead.`, 400);

const spaced = (secret) => String(secret || '').replace(/(.{4})/g, '$1 ').trim();

// One sign-in challenge and every call made with it, so the screens can verify a
// code, or — when the sign-in was started to change settings — open management.
export function mfaSession(challenge) {
  let factorId = challenge?.factor_id || null;
  let challengeId = challenge?.challenge_id || null;
  const managing = Boolean(challenge?.for_management);

  const done = (session) => ({
    access_token: session?.access_token || null,
    ...(managing ? { mfa_management_token: 'supabase' } : {}),
  });

  return {
    // Sign-in with the enrolled authenticator app.
    async verify(code) {
      if (!factorId) throw new MfaError('This sign-in needs to be started again.', 401);
      if (!challengeId) {
        const created = await supabase.auth.mfa.challenge({ factorId });
        if (created.error) throw new MfaError(created.error.message, 400);
        challengeId = created.data.id;
      }
      const { data, error } = await supabase.auth.mfa.verify({ factorId, challengeId, code });
      if (error) throw new MfaError(error.message, error.status || 400);
      base44.auth.setToken();
      return done(data);
    },

    sendSignInCode: () => Promise.reject(unavailable('Text message codes')),

    // Enrollment: Supabase returns a QR code and the secret to type in.
    async setupAuthenticator() {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw new MfaError(error.message, 400);
      factorId = data.id;
      return {
        factor_id: data.id,
        qr_code: data.totp?.qr_code,
        secret: data.totp?.secret,
        secret_formatted: spaced(data.totp?.secret),
      };
    },

    async confirmAuthenticator(code) {
      if (!factorId) throw new MfaError('Start the authenticator setup again.', 400);
      const { data, error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw new MfaError(error.message, 400);
      base44.auth.setToken();
      return done(data);
    },

    sendPhoneCode: () => Promise.reject(unavailable('Text message codes')),
    confirmPhone: () => Promise.reject(unavailable('Text message codes')),

    // Management only: which factors this account has.
    async status() {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw new MfaError(error.message, 400);
      const verified = (data?.totp || []).filter((factor) => factor.status === 'verified');
      return { methods: verified.map(() => 'totp'), factors: verified, trusted_devices: [] };
    },

    sendProofCode: () => Promise.reject(unavailable('Text message codes')),

    async removeMethod(method) {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw new MfaError(error.message, 400);
      const factor = (data?.totp || []).find((item) => item.status === 'verified');
      if (!factor) throw new MfaError('That method is not set up on this account.', 400);
      const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error) throw new MfaError(removed.error.message, 400);
      return { ok: true };
    },

    forgetDevices: () => Promise.reject(unavailable('Remembered devices')),
  };
}

// Opening the settings page starts a fresh sign-in, then a code from an enrolled
// method; the result opens factor management instead of signing in.
export async function signInToManageMfa(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new MfaError(error.message, 400);

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = (factors?.totp || []).find((item) => item.status === 'verified');
  if (!factor) throw new MfaError('Add an authenticator app before changing these settings.', 400);

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError) throw new MfaError(challengeError.message, 400);

  return {
    next_step: 'verify',
    mfa_methods: ['totp'],
    factor_id: factor.id,
    challenge_id: challenge.id,
    for_management: true,
  };
}

// Supabase completes a provider sign-in through the redirect on return, so there
// is no separate challenge to pick up here.
export function resumeMfa() {
  return Promise.resolve(null);
}

// Provider sign-in returns straight to the app; two-factor is checked after the
// session exists, which is the step loginWithMfa performs.
export async function signInWithProvider(provider, returnTo) {
  return base44.auth.loginWithProvider(provider, returnTo);
}

// The sign-in settings the screens read: which methods exist and whether a
// second step is required. MFA is opt-in, so nobody is locked out by it.
export async function loadSignInOptions() {
  return {
    name: 'Beam',
    organization_id: null,
    auth_config: {
      mfa_policy: 'optional',
      enable_google_login: true,
      enable_microsoft_login: false,
      enable_facebook_login: false,
      enable_apple_login: false,
      use_workspace_sso: false,
    },
  };
}

// After a second step: a popup sign-in hands the session to the window that
// opened it; otherwise go on to where the person was headed.
export function finishSignIn(accessToken, returnTo) {
  if (new URLSearchParams(window.location.search).get('popup') === '1' && window.opener) {
    window.opener.postMessage({ access_token: accessToken }, window.location.origin);
    window.close();
    return;
  }
  window.location.href = returnTo || '/';
}
