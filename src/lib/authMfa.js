import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';

// Sign-in against Supabase Auth.
//
// The screens call loginWithMfa() and expect either a plain session or a second
// step; that contract is kept, with the second step being the authenticator app
// factor enrolled on the account.

// If the account has a verified authenticator app, the password sign-in stops at
// the challenge Supabase hands back until a code from that app is entered.
export async function loginWithMfa(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message || 'Unable to sign in');
  base44.auth.setToken();

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assurance?.nextLevel !== 'aal2' || assurance?.currentLevel === 'aal2') {
    return { access_token: data.session?.access_token || null };
  }

  const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
  if (factorError) throw new Error(factorError.message);
  const factor = (factors?.totp || []).find((item) => item.status === 'verified');
  if (!factor) return { access_token: data.session?.access_token || null };

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError) throw new Error(challengeError.message);

  return {
    mfa_required: true,
    next_step: 'verify',
    mfa_methods: ['totp'],
    factor_id: factor.id,
    challenge_id: challenge.id,
  };
}

// provider: 'google' | 'microsoft' | 'facebook' | 'apple'
export async function loginWithSocial(provider, returnTo) {
  return base44.auth.loginWithProvider(provider, returnTo);
}

export function loginWithGoogle(returnTo) {
  return loginWithSocial('google', returnTo);
}
