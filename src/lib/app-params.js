const TOKEN_KEY = 'beam_token';

const read = (key) => {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const write = (key, value) => {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable — session simply won't survive a reload */
  }
};

export const appParams = {
  get token() {
    return read(TOKEN_KEY);
  },
  set token(value) {
    write(TOKEN_KEY, value);
  },
  clearToken() {
    write(TOKEN_KEY, '');
  },
};
