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

function prepareRequest(url, options = {}, extraHeaders = {}) {
  const clientId = ensureClientId();
  const headers = new Headers(options.headers ?? {});
  headers.set(CLIENT_ID_HEADER, clientId);

  if (extraHeaders && typeof extraHeaders === 'object') {
    Object.entries(extraHeaders).forEach(([key, value]) => {
      if (typeof key === 'string' && typeof value === 'string' && value.trim()) {
        headers.set(key, value);
      }
    });
  }

  const requestInit = { ...options, headers };
  const targetUrl = new URL(url, window.location.origin);
  if (!targetUrl.searchParams.has('client_id')) {
    targetUrl.searchParams.set('client_id', clientId);
  }

  return { targetUrl, requestInit, clientId };
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
  const { targetUrl, requestInit } = prepareRequest(url, options);

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

export async function streamJson(url, options = {}, onEvent) {
  const { targetUrl, requestInit } = prepareRequest(url, options, {
    Accept: 'text/event-stream',
  });

  const response = await fetch(targetUrl.toString(), requestInit);
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.detail || body?.message || '';
    } catch (error) {
      // ignore parse errors
    }
    throw new Error(detail || `请求失败：${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('当前浏览器不支持流式响应');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalPayload = null;

  const safeEmit = typeof onEvent === 'function'
    ? (payload) => {
        try {
          onEvent(payload);
        } catch (error) {
          console.error('Stream handler error', error);
        }
      }
    : () => {};

  const parseAndEmit = (rawEvent, errorContext = '') => {
    const dataLines = rawEvent
      .split('\n')
      .filter((line) => line.startsWith('data:'));
    if (dataLines.length === 0) {
      return null;
    }
    const dataString = dataLines.map((line) => line.slice(5).trim()).join('\n');
    if (!dataString) {
      return null;
    }
    let payload;
    try {
      payload = JSON.parse(dataString);
    } catch (error) {
      console.warn(`无法解析${errorContext}流式事件：`, error);
      return null;
    }
    safeEmit(payload);
    if (payload?.type === 'final') {
      finalPayload = payload.payload ?? null;
      return 'final';
    }
    if (payload?.type === 'error') {
      const message =
        typeof payload.message === 'string' && payload.message.trim()
          ? payload.message.trim()
          : '流式响应出错';
      throw new Error(message);
    }
    return null;
  };

  const processBuffer = (flush = false) => {
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const state = parseAndEmit(rawEvent, '');
      if (state === 'final') return 'final';
    }

    if (flush && buffer.trim()) {
      const tail = buffer.trim();
      buffer = '';
      const state = parseAndEmit(tail, '尾部');
      if (state === 'final') return 'final';
    }

    return null;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode(new Uint8Array(), { stream: false });
        processBuffer(true);
        break;
      }
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const state = processBuffer(false);
        if (state === 'final') {
          await reader.cancel().catch(() => {});
          break;
        }
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch (error) {
      // ignore release errors
    }
  }

  if (finalPayload === null) {
    throw new Error('未接收到完整的模型回复');
  }

  return finalPayload;
}
