// Values the app used to read from its previous backend.
//
// Supabase keeps the session itself, so there is no access token to hand around;
// `appBaseUrl` is where the app is served from, which the companion installers
// and helpers use to reach this app.
const isNode = typeof window === 'undefined';

const isClearAccessTokenRequested = () =>
  !isNode && new URLSearchParams(window.location.search).get('clear_access_token') === 'true';

// Links from the previous backend may still carry that flag; clear what it left
// behind so nothing stale is read.
const clearStoredAccessToken = () => {
  if (isNode) return;
  window.localStorage.removeItem('base44_access_token');
  window.localStorage.removeItem('token');
};

if (isClearAccessTokenRequested()) clearStoredAccessToken();

export const appParams = {
  appId: import.meta.env.VITE_SUPABASE_URL || '',
  token: null,
  functionsVersion: null,
  // Where the app is served from (companion files are downloaded from here)…
  appBaseUrl: import.meta.env.VITE_APP_BASE_URL || (isNode ? '' : window.location.origin),
  // …and where its backend lives: the Supabase project the companions call.
  backendUrl: import.meta.env.VITE_SUPABASE_URL || '',
};
