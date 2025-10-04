import { CLIENT_ID_HEADER, STORAGE_KEYS } from './constants.js';

function getSessionStorage() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }
  try {
    const storage = window.sessionStorage;
    const testKey = '__okc_session_test__';
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return storage;
  } catch (error) {
    return null;
  }
}

const sessionStorageHandle = getSessionStorage();
let cachedClientId = null;

function readSessionValue(key) {
  if (!sessionStorageHandle) return null;
  try {
    return sessionStorageHandle.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeSessionValue(key, value) {
  if (!sessionStorageHandle) return;
  try {
    sessionStorageHandle.setItem(key, value);
  } catch (error) {
    // ignore storage errors
  }
}

function ensureClientId() {
  if (cachedClientId) {
    return cachedClientId;
  }
  const existing = readSessionValue(STORAGE_KEYS.clientId);
  if (existing && typeof existing === 'string' && existing.trim()) {
    cachedClientId = existing;
    return cachedClientId;
  }
  const fresh = generateId();
  cachedClientId = fresh;
  writeSessionValue(STORAGE_KEYS.clientId, fresh);
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
