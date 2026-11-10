import { appParams } from '@/lib/app-params';

const request = async (path, { method = 'GET', body, signal } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  const token = appParams.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

export const base44 = {
  app: {
    getPublicSettings: () => request('/api/app-public-settings'),
  },
  auth: {
    me: () => request('/api/auth/me'),
    login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
    register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
    verifyMfa: (challenge, code) => request('/api/auth/mfa', { method: 'POST', body: { challenge, code } }),
    requestPasswordReset: (email) =>
      request('/api/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: (payload) => request('/api/auth/reset-password', { method: 'POST', body: payload }),
    logout: (redirectTo) => {
      appParams.clearToken();
      if (redirectTo) window.location.assign(redirectTo);
    },
    redirectToLogin: (next) => {
      window.location.assign(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
    },
  },
  devices: {
    list: () => request('/api/devices'),
    pair: (payload) => request('/api/devices/pair', { method: 'POST', body: payload }),
    approve: (id) => request(`/api/devices/${id}/approve`, { method: 'POST' }),
    decline: (id) => request(`/api/devices/${id}/decline`, { method: 'POST' }),
    get: (id) => request(`/api/devices/${id}`),
    update: (id, payload) => request(`/api/devices/${id}`, { method: 'PATCH', body: payload }),
    remove: (id) => request(`/api/devices/${id}`, { method: 'DELETE' }),
  },
  rooms: {
    create: (payload) => request('/api/rooms', { method: 'POST', body: payload }),
    join: (code, payload) => request(`/api/rooms/${code}/join`, { method: 'POST', body: payload }),
    peek: (code) => request(`/api/rooms/${code}`),
    state: (code, peer, sharing = false) =>
      request(`/api/rooms/${code}/state`, { method: 'POST', body: { peer, sharing } }),
    signal: (code, payload) => request(`/api/rooms/${code}/signal`, { method: 'POST', body: payload }),
    leave: (code, peer) => request(`/api/rooms/${code}/leave?peer=${encodeURIComponent(peer)}`, { method: 'POST' }),
  },
};
