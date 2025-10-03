import { cloneMessageActionIcon } from './messageActionIcons.js';

const DEFAULT_CONVERSATION_TITLE = '新的会话';
const CONVERSATION_TITLE_MAX_LENGTH = 20;

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const statusPill = document.getElementById('status-pill');
const modelLogList = document.getElementById('model-log');
const modelLogEmpty = document.getElementById('model-log-empty');
const webPreviewFrame = document.getElementById('web-preview-frame');
const webPreviewEmpty = document.getElementById('web-preview-empty');
const openWebPreviewButton = document.getElementById('open-web-preview');
const pptPreviewContainer = document.getElementById('ppt-preview');
const pptPreviewEmpty = document.getElementById('ppt-preview-empty');
const togglePptModeButton = document.getElementById('toggle-ppt-mode');
const modelLogTemplate = document.getElementById('model-log-item-template');
const pptSlideTemplate = document.getElementById('ppt-slide-template');
const configForm = document.getElementById('config-form');
const configStatus = document.getElementById('config-status');
const settingsToggle = document.getElementById('settings-toggle');
const settingsOverlay = document.getElementById('settings-overlay');
const settingsDrawer = settingsOverlay?.querySelector('.settings-drawer') ?? null;
const settingsCloseButtons = document.querySelectorAll('[data-action="close-settings"]');
const historySidebar = document.getElementById('history-sidebar');
const historyToggle = document.getElementById('history-toggle');
const historyPanel = document.getElementById('history-panel');
const conversationList = document.getElementById('conversation-list');
const conversationEmptyState = document.getElementById('conversation-empty');
const newConversationButton = document.getElementById('new-conversation');

let previousFocusedElement = null;
let lastRenderedConversationId = null;

const SERVICES = ['chat', 'image', 'speech', 'sound_effects', 'asr'];
const serviceInputs = SERVICES.reduce((acc, service) => {
  acc[service] = {
    model: document.querySelector(`input[data-service="${service}"][data-field="model"]`),
    base_url: document.querySelector(`input[data-service="${service}"][data-field="base_url"]`),
    api_key: document.querySelector(`input[data-service="${service}"][data-field="api_key"]`),
  };
  return acc;
}, {});

let currentWebPreview = null;
let currentPptSlides = [];
let isCarouselMode = false;
const modelLogs = [];

const STORAGE_KEYS = {
  conversations: 'okc.conversations',
  current: 'okc.conversations.current',
};

let storageAvailable = true;
try {
  const storageTestKey = '__okc_test__';
  window.localStorage.setItem(storageTestKey, storageTestKey);
  window.localStorage.removeItem(storageTestKey);
} catch (error) {
  storageAvailable = false;
}

const storage = {
  getItem(key) {
    if (!storageAvailable) return null;
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  },
  setItem(key, value) {
    if (!storageAvailable) return;
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // ignore storage errors
    }
  },
  removeItem(key) {
    if (!storageAvailable) return;
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // ignore storage errors
    }
  },
};

let conversations = [];
let currentSessionId = null;

function setInteractionDisabled(disabled) {
  if (userInput) {
    userInput.disabled = disabled;
  }
  const submitButton = chatForm?.querySelector('button');
  if (submitButton) {
    submitButton.disabled = disabled;
  }
}

function createMessageActionButton(label, action, iconName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'message-action';
  button.dataset.action = action;
  button.dataset.defaultLabel = label;
  button.title = label;
  button.setAttribute('aria-label', label);

  const iconSpan = document.createElement('span');
  iconSpan.className = 'message-action-icon';
  iconSpan.setAttribute('aria-hidden', 'true');

  if (iconName instanceof Node) {
    iconSpan.appendChild(iconName.cloneNode(true));
  } else if (typeof iconName === 'string') {
    const iconElement = cloneMessageActionIcon(iconName);
    if (iconElement) {
      iconSpan.appendChild(iconElement);
    } else {
      iconSpan.textContent = iconName;
    }
  }

  const labelSpan = document.createElement('span');
  labelSpan.className = 'message-action-label';
  labelSpan.setAttribute('aria-live', 'polite');

  button.append(iconSpan, labelSpan);
  return button;
}

function setMessageActionsDisabled(messageElement, disabled) {
  if (!(messageElement instanceof HTMLElement)) return;
  const buttons = messageElement.querySelectorAll('button.message-action');
  buttons.forEach((button) => {
    button.disabled = disabled;
    if (disabled) {
      clearMessageActionStatus(button);
    }
  });
}

const messageActionStatusTimers = new WeakMap();
const messageActionFeedbackTimers = new WeakMap();

function setMessageActionStatus(button, text) {
  if (!(button instanceof HTMLElement)) return;
  const existingTimeoutId = messageActionStatusTimers.get(button);
  if (typeof existingTimeoutId === 'number') {
    clearTimeout(existingTimeoutId);
    messageActionStatusTimers.delete(button);
  }
  const labelSpan = button.querySelector('.message-action-label');
  const message = typeof text === 'string' ? text : '';
  if (labelSpan) {
    labelSpan.textContent = message;
  }
  if (message && message.length > 0) {
    button.dataset.statusVisible = 'true';
  } else {
    delete button.dataset.statusVisible;
  }
  const defaultLabel = button.dataset.defaultLabel ?? '';
  button.title = message || defaultLabel;
  button.setAttribute('aria-label', message || defaultLabel);
}

function clearMessageActionStatus(button) {
  if (!(button instanceof HTMLElement)) return;
  const timeoutId = messageActionStatusTimers.get(button);
  if (typeof timeoutId === 'number') {
    clearTimeout(timeoutId);
  }
  messageActionStatusTimers.delete(button);
  setMessageActionStatus(button, '');
}

function flashMessageActionStatus(button, text, duration = 1200) {
  if (!(button instanceof HTMLElement)) return;
  const timeoutId = messageActionStatusTimers.get(button);
  if (typeof timeoutId === 'number') {
    clearTimeout(timeoutId);
  }
  setMessageActionStatus(button, text);
  if (duration > 0) {
    const newTimeoutId = window.setTimeout(() => {
      messageActionStatusTimers.delete(button);
      setMessageActionStatus(button, '');
    }, duration);
    messageActionStatusTimers.set(button, newTimeoutId);
  }
}

function setMessageActionFeedback(button, { status, message, duration = 1200 } = {}) {
  if (!(button instanceof HTMLElement)) return;

  const existingTimer = messageActionFeedbackTimers.get(button);
  if (typeof existingTimer === 'number') {
    clearTimeout(existingTimer);
    messageActionFeedbackTimers.delete(button);
  }

  if (typeof message === 'string') {
    flashMessageActionStatus(button, message, duration);
  }

  if (typeof status === 'string' && status.length > 0) {
    button.dataset.feedback = status;
    if (duration > 0) {
      const timeoutId = window.setTimeout(() => {
        delete button.dataset.feedback;
        messageActionFeedbackTimers.delete(button);
      }, duration);
      messageActionFeedbackTimers.set(button, timeoutId);
    }
  } else {
    delete button.dataset.feedback;
  }
}

function markMessagePending(messageElement, placeholderText) {
  if (!(messageElement instanceof HTMLElement)) return;
  messageElement.dataset.pending = 'true';
  messageElement.classList.add('pending');
  const body = messageElement.querySelector('p');
  if (body) {
    body.classList.add('pending');
    body.textContent = placeholderText ?? '正在生成回复…';
  }
  setMessageActionsDisabled(messageElement, true);
}

function findConversationByMessageId(messageId) {
  if (!messageId) return null;
  for (const conversation of conversations) {
    const messageIndex = conversation.messages.findIndex((message) => message.id === messageId);
    if (messageIndex !== -1) {
      return { conversation, messageIndex };
    }
  }
  return null;
}

function findPreviousUserMessage(conversation, fromIndex) {
  if (!conversation) return null;
  for (let index = fromIndex - 1; index >= 0; index -= 1) {
    const entry = conversation.messages[index];
    if (entry?.role === 'user' && typeof entry.content === 'string' && entry.content.trim().length > 0) {
      return entry;
    }
  }
  return null;
}

function generateConversationTitle(content) {
  const snippet = typeof content === 'string' ? content.trim() : '';
  if (snippet.length === 0) {
    return DEFAULT_CONVERSATION_TITLE;
  }
  if (snippet.length > CONVERSATION_TITLE_MAX_LENGTH) {
    return `${snippet.slice(0, CONVERSATION_TITLE_MAX_LENGTH)}…`;
  }
  return snippet;
}

async function writeToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn('Clipboard API write failed, falling back to execCommand.', error);
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previousRange = selection?.rangeCount ? selection.getRangeAt(0) : null;

  textarea.select();
  try {
    document.execCommand('copy');
  } catch (error) {
    console.error('Clipboard fallback failed', error);
    throw error;
  } finally {
    textarea.remove();
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
}

async function handleCopyMessageAction(messageId, button) {
  if (!button) return;
  const match = findConversationByMessageId(messageId);
  if (!match) return;
  const { conversation, messageIndex } = match;
  const message = conversation.messages[messageIndex];
  const content = message?.content ?? '';

  try {
    await writeToClipboard(content);
    setMessageActionFeedback(button, { status: 'success', message: '已复制' });
  } catch (error) {
    console.error(error);
    setMessageActionFeedback(button, { status: 'error', message: '复制失败', duration: 1500 });
  }
}

function handleEditMessageAction(messageElement, messageId) {
  if (!messageElement) return;
  const match = findConversationByMessageId(messageId);
  if (!match) return;
  const { conversation, messageIndex } = match;
  const message = conversation.messages[messageIndex];
  if (!message || message.role !== 'user') return;

  const body = messageElement.querySelector('p');
  const currentContent = typeof message.content === 'string' ? message.content : body?.textContent ?? '';
  const nextContent = window.prompt('编辑这条消息', currentContent ?? '');
  if (nextContent === null) return;

  const normalized = nextContent.replace(/\r\n/g, '\n');
  message.content = normalized;
  const timestamp = new Date().toISOString();
  message.timestamp = timestamp;
  conversation.updatedAt = timestamp;
  bumpConversation(conversation.id);

  if (body) {
    body.textContent = normalized;
  }

  const timeElement = messageElement.querySelector('time');
  if (timeElement) {
    timeElement.dateTime = timestamp;
    timeElement.textContent = new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  conversation.title = generateConversationTitle(normalized);

  saveConversationsToStorage();
  renderConversationList();
}

async function regenerateAssistantMessage(messageElement, messageId, button) {
  if (!messageElement || !button) return;
  const match = findConversationByMessageId(messageId);
  if (!match) return;
  const { conversation, messageIndex } = match;
  const assistantMessage = conversation.messages[messageIndex];
  if (!assistantMessage || assistantMessage.role !== 'assistant') return;

  const precedingUserMessage = findPreviousUserMessage(conversation, messageIndex);
  if (!precedingUserMessage) {
    setMessageActionFeedback(button, { status: 'error', message: '无法刷新', duration: 1500 });
    return;
  }

  button.dataset.loading = 'true';
  setMessageActionStatus(button, '刷新中…');

  setStatus('重新生成中…', true);
  setInteractionDisabled(true);

  const placeholder = '正在重新生成回复…';
  markMessagePending(messageElement, placeholder);

  const timestamp = new Date().toISOString();
  assistantMessage.pending = true;
  assistantMessage.content = '';
  assistantMessage.timestamp = timestamp;
  conversation.updatedAt = timestamp;
  bumpConversation(conversation.id);
  saveConversationsToStorage();
  renderConversationList();

  try {
    const data = await fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: precedingUserMessage.content }),
    });
    finalizePendingMessage(messageElement, data.reply, messageId);
    if (data.meta) {
      logModelInvocation(data.meta);
    }
    updateWebPreview(data.web_preview);
    updatePptPreview(data.ppt_slides);
    setMessageActionFeedback(button, { status: 'success', message: '已刷新', duration: 1500 });
  } catch (error) {
    console.error(error);
    finalizePendingMessage(messageElement, `重新生成失败：${error.message}`, messageId);
    setMessageActionFeedback(button, { status: 'error', message: '刷新失败', duration: 1500 });
  } finally {
    setStatus('待命中…');
    setInteractionDisabled(false);
    if (userInput) {
      userInput.focus();
    }
    delete button.dataset.loading;
  }
}

function openSettingsPanel() {
  if (!settingsOverlay || !settingsToggle) return;
  if (!settingsOverlay.hidden) return;

  previousFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  settingsOverlay.hidden = false;
  document.body?.classList.add('no-scroll');
  settingsToggle.setAttribute('aria-expanded', 'true');

  const firstInput = configForm?.querySelector('input, select, textarea, button');
  if (firstInput instanceof HTMLElement) {
    firstInput.focus();
  } else if (settingsDrawer instanceof HTMLElement) {
    settingsDrawer.focus();
  }
}

function closeSettingsPanel() {
  if (!settingsOverlay || !settingsToggle) return;
  if (settingsOverlay.hidden) return;

  settingsOverlay.hidden = true;
  document.body?.classList.remove('no-scroll');
  settingsToggle.setAttribute('aria-expanded', 'false');

  const focusTarget = previousFocusedElement instanceof HTMLElement ? previousFocusedElement : settingsToggle;
  previousFocusedElement = null;
  if (focusTarget instanceof HTMLElement) {
    focusTarget.focus();
  }
}

if (settingsToggle && settingsOverlay) {
  settingsToggle.addEventListener('click', () => {
    if (settingsOverlay.hidden) {
      openSettingsPanel();
    } else {
      closeSettingsPanel();
    }
  });
}

settingsCloseButtons.forEach((button) => {
  button.addEventListener('click', closeSettingsPanel);
});

if (settingsOverlay) {
  settingsOverlay.addEventListener('click', (event) => {
    if (event.target === settingsOverlay) {
      closeSettingsPanel();
    }
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!settingsOverlay?.hidden) {
    event.preventDefault();
    closeSettingsPanel();
    return;
  }
  if (historySidebar?.classList.contains('open')) {
    event.preventDefault();
    setHistoryOpen(false);
    historyToggle?.focus();
  }
});

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function isHistoryOpen() {
  return historySidebar?.classList.contains('open') ?? false;
}

function setHistoryOpen(shouldOpen) {
  if (!historySidebar || !historyToggle) return false;
  if (shouldOpen) {
    historySidebar.classList.add('open');
  } else {
    historySidebar.classList.remove('open');
  }
  historyToggle.setAttribute('aria-expanded', String(shouldOpen));
  if (shouldOpen) {
    historyPanel?.focus();
  }
  return shouldOpen;
}

function toggleHistoryPanel(force) {
  if (!historySidebar || !historyToggle) return false;
  const targetState = typeof force === 'boolean' ? force : !isHistoryOpen();
  return setHistoryOpen(targetState);
}

function formatConversationTime(isoString) {
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

function normalizeConversation(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const now = new Date().toISOString();
  const normalized = {
    id: typeof entry.id === 'string' && entry.id ? entry.id : generateId(),
    title:
      typeof entry.title === 'string' && entry.title.trim().length > 0
        ? entry.title.trim()
        : DEFAULT_CONVERSATION_TITLE,
    createdAt: typeof entry.createdAt === 'string' && !Number.isNaN(Date.parse(entry.createdAt)) ? entry.createdAt : now,
    updatedAt: typeof entry.updatedAt === 'string' && !Number.isNaN(Date.parse(entry.updatedAt)) ? entry.updatedAt : (entry.createdAt ?? now),
    messages: [],
  };

  if (Array.isArray(entry.messages)) {
    normalized.messages = entry.messages
      .map((message) => {
        if (!message || typeof message !== 'object') return null;
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        const content = typeof message.content === 'string' ? message.content : '';
        const timestamp =
          typeof message.timestamp === 'string' && !Number.isNaN(Date.parse(message.timestamp))
            ? message.timestamp
            : now;
        return {
          id: typeof message.id === 'string' && message.id ? message.id : generateId(),
          role,
          content,
          timestamp,
          pending: Boolean(message.pending),
        };
      })
      .filter(Boolean);
  }

  return normalized;
}

function loadConversationsFromStorage() {
  const raw = storage.getItem(STORAGE_KEYS.conversations);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        conversations = parsed
          .map((entry) => normalizeConversation(entry))
          .filter((entry) => entry !== null);
      }
    } catch (error) {
      conversations = [];
    }
  }

  const storedCurrent = storage.getItem(STORAGE_KEYS.current);
  if (typeof storedCurrent === 'string' && storedCurrent) {
    currentSessionId = storedCurrent;
  }

  if (!getCurrentConversation() && conversations.length > 0) {
    currentSessionId = conversations[0].id;
  }
}

function saveConversationsToStorage() {
  storage.setItem(STORAGE_KEYS.conversations, JSON.stringify(conversations));
  if (currentSessionId) {
    storage.setItem(STORAGE_KEYS.current, currentSessionId);
  } else {
    storage.removeItem(STORAGE_KEYS.current);
  }
}

function getCurrentConversation() {
  return conversations.find((conversation) => conversation.id === currentSessionId) ?? null;
}

function ensureCurrentConversation() {
  if (getCurrentConversation()) return;
  if (conversations.length === 0) {
    createConversation();
    return;
  }
  currentSessionId = conversations[0].id;
  saveConversationsToStorage();
}

function createConversation(options = {}) {
  const now = new Date().toISOString();
  const conversation = {
    id: generateId(),
    title: options.title ?? DEFAULT_CONVERSATION_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  conversations.unshift(conversation);
  currentSessionId = conversation.id;
  saveConversationsToStorage();
  renderConversationList();
  return conversation;
}

function bumpConversation(conversationId) {
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index > 0) {
    const [entry] = conversations.splice(index, 1);
    conversations.unshift(entry);
  }
}

function renderConversationList() {
  if (!conversationList) return;
  conversationList.innerHTML = '';

  if (conversations.length === 0) {
    if (conversationEmptyState) {
      conversationEmptyState.hidden = false;
    }
    return;
  }

  if (conversationEmptyState) {
    conversationEmptyState.hidden = true;
  }

  conversations.forEach((conversation) => {
    const item = document.createElement('li');
    item.className = 'conversation-entry';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'conversation-item';
    if (conversation.id === currentSessionId) {
      button.classList.add('active');
    }
    button.dataset.conversationId = conversation.id;

    const title = document.createElement('span');
    title.className = 'conversation-title';
    title.textContent = conversation.title ?? DEFAULT_CONVERSATION_TITLE;

    const meta = document.createElement('span');
    meta.className = 'conversation-meta';
    meta.textContent = formatConversationTime(conversation.updatedAt);

    button.append(title, meta);
    item.appendChild(button);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'conversation-delete';
    deleteButton.dataset.action = 'delete';
    deleteButton.dataset.conversationId = conversation.id;
    deleteButton.setAttribute(
      'aria-label',
      `删除会话 ${conversation.title ?? ''}`.trim() || '删除会话',
    );

    const deleteIcon = document.createElement('span');
    deleteIcon.setAttribute('aria-hidden', 'true');
    deleteIcon.textContent = '🗑️';
    deleteButton.appendChild(deleteIcon);

    item.appendChild(deleteButton);
    conversationList.appendChild(item);
  });
}

function resetSessionOutputs() {
  modelLogs.length = 0;
  if (modelLogList) {
    modelLogList.innerHTML = '';
  }
  if (modelLogEmpty) {
    modelLogEmpty.hidden = false;
  }
  updateWebPreview(null);
  updatePptPreview([]);
}

function renderConversation(conversation) {
  if (!chatMessages) return;
  const target = conversation ?? getCurrentConversation();
  if (!target) {
    chatMessages.innerHTML = '';
    lastRenderedConversationId = null;
    return;
  }

  const isDifferentConversation = target.id !== lastRenderedConversationId;
  if (isDifferentConversation) {
    resetSessionOutputs();
  }

  chatMessages.innerHTML = '';
  target.messages.forEach((message) => {
    const element = addMessage(message.role, message.content, { pending: message.pending });
    if (element instanceof HTMLElement) {
      element.dataset.messageId = message.id;
    }
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
  lastRenderedConversationId = target.id;

  if (userInput) {
    userInput.value = '';
    userInput.disabled = false;
  }
  const submitButton = chatForm?.querySelector('button');
  if (submitButton) {
    submitButton.disabled = false;
  }
}

function appendMessageToConversation(role, content, options = {}) {
  ensureCurrentConversation();
  const conversation = getCurrentConversation();
  if (!conversation) return null;

  const timestamp = new Date().toISOString();
  const message = {
    id: generateId(),
    role,
    content: typeof content === 'string' ? content : '',
    timestamp,
    pending: Boolean(options.pending),
  };

  conversation.messages.push(message);
  conversation.updatedAt = timestamp;

  if (role === 'user') {
    const nextTitle = generateConversationTitle(message.content);
    if (nextTitle !== DEFAULT_CONVERSATION_TITLE) {
      conversation.title = nextTitle;
    }
  }

  bumpConversation(conversation.id);
  saveConversationsToStorage();
  renderConversationList();
  return message.id;
}

function resolvePendingConversationMessage(messageId, content) {
  if (!messageId) return;
  const timestamp = new Date().toISOString();
  const conversation = conversations.find(c => c.messages.some(m => m.id === messageId));
  if (!conversation) return;

  const message = conversation.messages.find((entry) => entry.id === messageId);
  if (message) {
    message.content = typeof content === 'string' ? content : '';
    message.pending = false;
    message.timestamp = timestamp;
    conversation.updatedAt = timestamp;
    bumpConversation(conversation.id);
    saveConversationsToStorage();
    renderConversationList();
  }
}

function initializeConversationState() {
  loadConversationsFromStorage();
  ensureCurrentConversation();
  renderConversationList();
  renderConversation();
  return getCurrentConversation();
}

function closeHistoryOnMobile() {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mediaQuery = window.matchMedia('(max-width: 1080px)');
    if (mediaQuery.matches) {
      setHistoryOpen(false);
      historyToggle?.focus();
    }
  }
}

function selectConversation(conversationId) {
  if (!conversationId) return;
  const conversation = conversations.find((entry) => entry.id === conversationId);
  if (!conversation) return;

  currentSessionId = conversation.id;
  saveConversationsToStorage();
  renderConversationList();
  renderConversation(conversation);

  closeHistoryOnMobile();

  setStatus('待命中…');
  if (userInput) {
    userInput.focus();
  }
}

function startNewConversation() {
  const conversation = createConversation();
  renderConversation(conversation);

  closeHistoryOnMobile();

  setStatus('连接工作台…', true);
  bootSession();
}

async function deleteConversation(conversationId) {
  if (!conversationId) return;
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index === -1) return;

  const [removed] = conversations.splice(index, 1);
  const wasCurrent = removed.id === currentSessionId;

  if (wasCurrent) {
    currentSessionId = null;
    setStatus('清理会话…', true);
  }

  saveConversationsToStorage();
  renderConversationList();

  if (!wasCurrent) {
    return;
  }

  resetSessionOutputs();
  renderConversation(null);

  try {
    await deleteSessionHistory();
  } catch (error) {
    console.error(error);
    conversations.splice(index, 0, removed);
    selectConversation(removed.id);
    addAndRenderMessage('assistant', `清理会话失败：${error.message || '未知错误'}`);
    return;
  }

  const conversation = createConversation();
  renderConversation(conversation);
  closeHistoryOnMobile();
  setStatus('连接工作台…', true);
  bootSession();
}

if (historyToggle) {
  historyToggle.addEventListener('click', () => {
    const isOpen = toggleHistoryPanel();
    if (!isOpen) {
      historyToggle.focus();
    }
  });
}

if (conversationList) {
  conversationList.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const deleteButton = target.closest('button[data-action="delete"]');
    if (deleteButton instanceof HTMLElement && conversationList.contains(deleteButton)) {
      event.preventDefault();
      event.stopPropagation();
      const { conversationId } = deleteButton.dataset;
      if (conversationId) {
        deleteConversation(conversationId).catch((error) => console.error(error));
      }
      return;
    }

    const conversationButton = target.closest('.conversation-item');
    if (!conversationButton || !conversationList.contains(conversationButton)) return;

    const { conversationId } = conversationButton.dataset;
    if (conversationId) {
      selectConversation(conversationId);
    }
  });
}

if (newConversationButton) {
  newConversationButton.addEventListener('click', startNewConversation);
}

function addMessage(role, text, options = {}) {
  const { pending = false } = options;
  const message = document.createElement('article');
  message.className = `message ${role}`;

  const header = document.createElement('header');
  const name = document.createElement('strong');
  name.textContent = role === 'user' ? '用户' : 'OK Computer';
  const time = document.createElement('time');
  time.dateTime = new Date().toISOString();
  time.textContent = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  header.append(name, time);

  const body = document.createElement('p');
  if (typeof text === 'string' && text.length > 0) {
    body.textContent = text;
  } else {
    body.textContent = '';
  }

  const actions = document.createElement('div');
  actions.className = 'message-actions';

  if (role === 'user') {
    actions.appendChild(createMessageActionButton('编辑', 'edit', 'edit'));
  }

  actions.appendChild(createMessageActionButton('复制', 'copy', 'copy'));

  if (role === 'assistant') {
    actions.appendChild(createMessageActionButton('刷新', 'refresh', 'refresh'));
  }

  message.append(header, body, actions);

  if (pending) {
    markMessagePending(message, body.textContent || '正在生成回复…');
  } else {
    setMessageActionsDisabled(message, false);
  }
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

function addAndRenderMessage(role, text, options = {}) {
  const messageId = appendMessageToConversation(role, text, options);
  const messageElement = addMessage(role, text, options);
  if (messageElement instanceof HTMLElement && messageId) {
    messageElement.dataset.messageId = messageId;
  }
  return { messageId, messageElement };
}

function finalizePendingMessage(message, text, messageId) {
  const finalText = typeof text === 'string' ? text : '';
  if (!(message instanceof HTMLElement)) {
    if (messageId) {
      resolvePendingConversationMessage(messageId, finalText);
      const messageConversation = conversations.find((conversation) =>
        conversation.messages.some((entry) => entry.id === messageId),
      );
      if (messageConversation && messageConversation.id === lastRenderedConversationId) {
        const restoredMessage = addMessage('assistant', finalText);
        if (restoredMessage instanceof HTMLElement) {
          restoredMessage.dataset.messageId = messageId;
        }
      }
    } else {
      addAndRenderMessage('assistant', finalText);
    }
    return;
  }

  const body = message.querySelector('p');
  if (body) {
    body.textContent = finalText;
    body.classList.remove('pending');
  }

  message.classList.remove('pending');
  if (message.dataset) {
    delete message.dataset.pending;
  }
  message.removeAttribute('data-pending');
  setMessageActionsDisabled(message, false);

  if (messageId) {
    resolvePendingConversationMessage(messageId, finalText);
  }
}

function logModelInvocation(meta) {
  if (!meta) return;
  modelLogs.push(meta);
  const limit = 6;
  if (modelLogs.length > limit) {
    modelLogs.splice(0, modelLogs.length - limit);
  }

  modelLogList.innerHTML = '';
  modelLogs.forEach((log) => {
    const clone = modelLogTemplate.content.cloneNode(true);
    clone.querySelector('.model-name').textContent = log.model;
    clone.querySelector('.model-time').textContent = log.timestamp;
    clone.querySelector('.model-summary').textContent = log.summary;
    clone.querySelector('.meta-input').textContent = log.tokensIn;
    clone.querySelector('.meta-output').textContent = log.tokensOut;
    clone.querySelector('.meta-latency').textContent = log.latency;
    modelLogList.appendChild(clone);
  });

  modelLogEmpty.hidden = modelLogs.length > 0;
  if (modelLogs.length > 0) {
    modelLogList.scrollTop = modelLogList.scrollHeight;
  }
}

function updateWebPreview(preview) {
  currentWebPreview = preview;
  if (preview?.html) {
    webPreviewFrame.srcdoc = preview.html;
    webPreviewFrame.hidden = false;
    webPreviewEmpty.hidden = true;
    openWebPreviewButton.disabled = false;
  } else {
    webPreviewFrame.srcdoc = '';
    webPreviewFrame.hidden = true;
    webPreviewEmpty.hidden = false;
    openWebPreviewButton.disabled = true;
  }
}

function updatePptPreview(slides) {
  currentPptSlides = Array.isArray(slides) ? slides : [];
  pptPreviewContainer.innerHTML = '';

  if (currentPptSlides.length === 0) {
    pptPreviewEmpty.hidden = false;
    pptPreviewContainer.hidden = true;
    togglePptModeButton.disabled = true;
    if (isCarouselMode) {
      isCarouselMode = false;
      pptPreviewContainer.classList.remove('carousel');
    }
    togglePptModeButton.textContent = '幻灯模式';
    return;
  }

  pptPreviewEmpty.hidden = true;
  pptPreviewContainer.hidden = false;
  togglePptModeButton.disabled = false;
  togglePptModeButton.textContent = isCarouselMode ? '堆叠模式' : '幻灯模式';

  currentPptSlides.forEach((slide) => {
    const clone = pptSlideTemplate.content.cloneNode(true);
    clone.querySelector('h3').textContent = slide.title;
    const list = clone.querySelector('ul');
    slide.bullets.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    pptPreviewContainer.appendChild(clone);
  });
}

function togglePptMode() {
  isCarouselMode = !isCarouselMode;
  pptPreviewContainer.classList.toggle('carousel', isCarouselMode);
  togglePptModeButton.textContent = isCarouselMode ? '堆叠模式' : '幻灯模式';
}

togglePptModeButton.addEventListener('click', togglePptMode);

openWebPreviewButton.addEventListener('click', () => {
  if (!currentWebPreview?.html) return;
  const blob = new Blob([currentWebPreview.html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function setStatus(text, busy = false) {
  statusPill.textContent = text;
  statusPill.dataset.busy = busy ? 'true' : 'false';
}

function showConfigStatus(message, variant) {
  if (!configStatus) return;
  configStatus.textContent = message;
  configStatus.classList.remove('success', 'error');
  if (variant) {
    configStatus.classList.add(variant);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
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

function populateConfigForm(data) {
  SERVICES.forEach((service) => {
    const fields = serviceInputs[service];
    if (!fields) return;
    const entry = data?.[service];
    fields.model.value = entry?.model ?? '';
    fields.base_url.value = entry?.base_url ?? '';
    fields.api_key.value = '';
    fields.api_key.placeholder = entry?.api_key_present
      ? '已保存，更新请重新输入'
      : '••••••';
  });
}

function collectConfigPayload() {
  const payload = {};
  SERVICES.forEach((service) => {
    const fields = serviceInputs[service];
    if (!fields) return;
    const entry = {};
    const model = fields.model.value.trim();
    const baseUrl = fields.base_url.value.trim();
    const apiKey = fields.api_key.value.trim();
    if (model) entry.model = model;
    if (baseUrl) entry.base_url = baseUrl;
    if (apiKey) entry.api_key = apiKey;
    payload[service] = Object.keys(entry).length > 0 ? entry : null;
  });
  return payload;
}

async function loadConfig() {
  if (!configForm) return;
  try {
    const data = await fetchJson('/api/config');
    populateConfigForm(data);
    showConfigStatus('已加载当前配置', 'success');
    setTimeout(() => showConfigStatus(''), 3000);
  } catch (error) {
    console.error(error);
    showConfigStatus(error.message || '无法加载配置', 'error');
  }
}

async function handleConfigSubmit(event) {
  event.preventDefault();
  const submitButton = configForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showConfigStatus('保存中…');
  try {
    const payload = collectConfigPayload();
    const data = await fetchJson('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    populateConfigForm(data);
    showConfigStatus('配置已更新', 'success');
    setTimeout(() => showConfigStatus(''), 3500);
  } catch (error) {
    console.error(error);
    showConfigStatus(error.message || '保存失败', 'error');
  } finally {
    SERVICES.forEach((service) => {
      const fields = serviceInputs[service];
      if (fields?.api_key) {
        fields.api_key.value = '';
      }
    });
    submitButton.disabled = false;
  }
}

if (configForm) {
  configForm.addEventListener('submit', handleConfigSubmit);
}

async function bootSession() {
  try {
    const data = await fetchJson('/api/session/boot');
    addAndRenderMessage('assistant', data.reply);
    logModelInvocation(data.meta);
    updateWebPreview(data.web_preview);
    updatePptPreview(data.ppt_slides);
  } catch (error) {
    console.error(error);
    addAndRenderMessage('assistant', '无法连接到后端服务，请确认已启动。');
  } finally {
    setStatus('待命中…');
  }
}

async function deleteSessionHistory() {
  return fetchJson('/api/session/history', { method: 'DELETE' });
}

async function sendChat(message) {
  setStatus('创意生成中…', true);
  setInteractionDisabled(true);
  const { messageId: pendingMessageId, messageElement: pendingMessage } = addAndRenderMessage(
    'assistant',
    '正在生成回复…',
    { pending: true },
  );
  try {
    const data = await fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    finalizePendingMessage(pendingMessage, data.reply, pendingMessageId);
    logModelInvocation(data.meta);
    updateWebPreview(data.web_preview);
    updatePptPreview(data.ppt_slides);
  } catch (error) {
    console.error(error);
    finalizePendingMessage(
      pendingMessage,
      `抱歉，发生错误：${error.message}`,
      pendingMessageId,
    );
  } finally {
    setStatus('待命中…');
    setInteractionDisabled(false);
    userInput.value = '';
    userInput.focus();
  }
}

function handleUserSubmit(event) {
  event.preventDefault();
  const value = userInput.value.trim();
  if (!value) return;
  addAndRenderMessage('user', value);
  sendChat(value);
}

chatForm.addEventListener('submit', handleUserSubmit);

if (chatMessages) {
  chatMessages.addEventListener('click', (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('button.message-action') : null;
    if (!target) return;

    const action = target.dataset.action;
    if (!action) return;

    const messageElement = target.closest('.message');
    const messageId = messageElement?.dataset.messageId;
    if (!messageElement || !messageId) return;

    event.preventDefault();
    event.stopPropagation();

    switch (action) {
      case 'copy':
        handleCopyMessageAction(messageId, target);
        break;
      case 'edit':
        handleEditMessageAction(messageElement, messageId);
        break;
      case 'refresh':
        regenerateAssistantMessage(messageElement, messageId, target);
        break;
      default:
        break;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const conversation = initializeConversationState();
  loadConfig();

  if (!conversation || conversation.messages.length === 0) {
    setStatus('连接工作台…', true);
    bootSession();
  } else {
    setStatus('待命中…');
    if (userInput) {
      userInput.focus();
    }
  }
});
