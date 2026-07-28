// Device-local accounts. This is a soft lock for sharing one phone between
// siblings — not real security. Nothing here leaves the device, and anyone with
// devtools can read localStorage. See the note in README.md.
import { app, session } from './store.js';

const ITERATIONS = 210000;
const AVATAR_COLORS = ['#7c5cff', '#f472b6', '#34d399', '#fbbf24', '#38bdf8', '#fb7185', '#a78bfa'];

const bytesToHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => bytesToHex(crypto.getRandomValues(new Uint8Array(n)));

async function derive(password, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return bytesToHex(bits);
}

// Compare in constant time so timing can't leak the hash.
function sameHash(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const accounts = () => app.get('accounts', []);
const saveAccounts = (list) => app.set('accounts', list);

const normalize = (name) => name.trim().toLowerCase();

export function listProfiles() {
  return accounts().map(({ username, displayName, avatarColor, createdAt }) => ({
    username,
    displayName,
    avatarColor,
    createdAt,
  }));
}

export const hasAccounts = () => accounts().length > 0;

export async function createAccount(rawName, password) {
  const displayName = rawName.trim();
  const username = normalize(displayName);
  if (username.length < 2) throw new Error('nameTooShort');
  if (password.length < 4) throw new Error('passwordTooShort');
  const list = accounts();
  if (list.some((a) => a.username === username)) throw new Error('nameTaken');

  const salt = randomHex(16);
  list.push({
    username,
    displayName,
    salt,
    hash: await derive(password, salt),
    avatarColor: AVATAR_COLORS[list.length % AVATAR_COLORS.length],
    createdAt: Date.now(),
  });
  saveAccounts(list);
  return username;
}

export async function signIn(rawName, password, remember) {
  const username = normalize(rawName);
  const account = accounts().find((a) => a.username === username);
  // Derive regardless of whether the account exists, so a wrong username and a
  // wrong password take the same time and look the same to the user.
  const salt = account?.salt ?? randomHex(16);
  const hash = await derive(password, salt);
  if (!account || !sameHash(hash, account.hash)) throw new Error('badCredentials');

  const token = randomHex(24);
  session.save(username, token, remember);
  return account;
}

export function currentUser() {
  const active = session.load();
  if (!active) return null;
  return accounts().find((a) => a.username === active.username) ?? null;
}

export function signOut() {
  session.clear();
}
