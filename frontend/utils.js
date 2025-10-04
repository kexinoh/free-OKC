import { CLIENT_ID_HEADER, STORAGE_KEYS } from './constants.js';

const CLIENT_ID_COOKIE = 'okc_client_id';

function getBrowserStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  const candidates = [
    () => window.localStorage,
    () => window.sessionStorage,
  ];
  for (const factory of candidates) {
    try {
      const storage = factory();
      if (!storage) continue;
      const testKey = '__okc_storage_test__';
      storage.setItem(testKey, testKey);
      storage.removeItem(testKey);
      return storage;
    } catch (error) {
      // ignore and try next storage option
    }
  }
  return null;
}

const storageHandle = getBrowserStorage();
let cachedClientId = null;

function readStoredValue(key) {
  if (!storageHandle) return null;
  try {
    return storageHandle.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStoredValue(key, value) {
  if (!storageHandle) return;
  try {
    storageHandle.setItem(key, value);
  } catch (error) {
    // ignore storage errors
  }
}

function readClientIdCookie() {
  if (typeof document === 'undefined') return null;
  const pattern = new RegExp(`(?:^|;\s*)${CLIENT_ID_COOKIE}=([^;]+)`);
  const match = document.cookie.match(pattern);
  if (!match) return null;
  try {
    const decoded = decodeURIComponent(match[1]);
    return decoded && decoded.trim() ? decoded : null;
  } catch (error) {
    return null;
  }
}

function writeClientIdCookie(value) {
  if (typeof document === 'undefined' || !value) return;
  const encoded = encodeURIComponent(value);
  const maxAge = 60 * 60 * 24 * 365; // 1 year
  document.cookie = `${CLIENT_ID_COOKIE}=${encoded}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function ensureClientId() {
  if (cachedClientId) {
    return cachedClientId;
  }

  const cookieValue = readClientIdCookie();
  if (cookieValue) {
    cachedClientId = cookieValue;
    writeStoredValue(STORAGE_KEYS.clientId, cookieValue);
    return cachedClientId;
  }

  const storedValue = readStoredValue(STORAGE_KEYS.clientId);
  if (storedValue && typeof storedValue === 'string' && storedValue.trim()) {
    cachedClientId = storedValue.trim();
    writeClientIdCookie(cachedClientId);
    return cachedClientId;
  }

  const fresh = generateId();
  cachedClientId = fresh;
  writeStoredValue(STORAGE_KEYS.clientId, fresh);
  writeClientIdCookie(fresh);
  return cachedClientId;
}

export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

export function formatConversationTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function fetchJson(url, options = {}) {
  const clientId = ensureClientId();
  const headers = new Headers(options.headers ?? {});
  headers.set(CLIENT_ID_HEADER, clientId);

  const requestInit = { ...options, headers };
  const targetUrl = new URL(url, window.location.origin);
  if (!targetUrl.searchParams.has('client_id')) {
    targetUrl.searchParams.set('client_id', clientId);
  }

  const response = await fetch(targetUrl.toString(), requestInit);
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.detail || body?.message || '';
    } catch (error) {
      // ignore json parse errors
    }
    throw new Error(detail || `请求失败：${response.status}`);
  }
  return response.json();
}
