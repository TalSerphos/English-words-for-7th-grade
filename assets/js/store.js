// All persistence lives here so a future cloud backend only has to replace this file.
const NS = 'vocab:v1';

const read = (driver, key, fallback) => {
  try {
    const raw = driver.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const write = (driver, key, value) => {
  try {
    driver.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota or private-mode failures must not take the app down mid-session.
    return false;
  }
};

/* ── app-wide (not per profile) ─────────────────────────────────── */
export const app = {
  get: (key, fallback) => read(localStorage, `${NS}:${key}`, fallback),
  set: (key, value) => write(localStorage, `${NS}:${key}`, value),
  remove: (key) => localStorage.removeItem(`${NS}:${key}`),
};

/* ── per profile ────────────────────────────────────────────────── */
export function storeFor(username) {
  const prefix = `${NS}:u:${username}:`;
  return {
    username,
    get: (key, fallback) => read(localStorage, prefix + key, fallback),
    set: (key, value) => write(localStorage, prefix + key, value),
    remove: (key) => localStorage.removeItem(prefix + key),
  };
}

/* ── session (survives reloads only when "stay signed in") ──────── */
const SESSION_KEY = `${NS}:session`;

export const session = {
  save(username, token, persist) {
    const value = { username, token, at: Date.now() };
    // Clear the other driver first so the two can never disagree.
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    write(persist ? localStorage : sessionStorage, SESSION_KEY, value);
  },
  load() {
    return read(localStorage, SESSION_KEY, null) ?? read(sessionStorage, SESSION_KEY, null);
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  },
};
