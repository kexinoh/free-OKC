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

function generateConversationTitle(content, { fallbackToDefault = true } = {}) {
  const normalized = typeof content === 'string' ? content.trim() : '';
  if (!normalized) {
    return fallbackToDefault ? '新的会话' : null;
  }
  return normalized.length > CONVERSATION_TITLE_MAX_LENGTH
    ? `${normalized.slice(0, CONVERSATION_TITLE_MAX_LENGTH)}…`
    : normalized;
}

function cloneMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((entry) => ({
    id: entry?.id ?? generateId(),
    role: entry?.role === 'assistant' ? 'assistant' : 'user',
    content: typeof entry?.content === 'string' ? entry.content : '',
    timestamp: typeof entry?.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
    pending: Boolean(entry?.pending),
  }));
}

function computeMessageSignature(messages) {
  const payload = (Array.isArray(messages) ? messages : []).map((entry) => [
    entry?.id ?? '',
    entry?.role === 'assistant' ? 'assistant' : 'user',
    typeof entry?.content === 'string' ? entry.content : '',
    typeof entry?.timestamp === 'string' ? entry.timestamp : '',
    entry?.pending ? 1 : 0,
  ]);
  return JSON.stringify(payload);
}

function captureBranchSelections(branches, overrides = {}) {
  if (!branches || typeof branches !== 'object') return {};
  const selections = {};
  Object.entries(branches).forEach(([messageId, state]) => {
    if (!state || !Array.isArray(state.versions) || state.versions.length === 0) return;
    const override = overrides[messageId];
    const index = Number.isInteger(override)
      ? override
      : Number.isInteger(state.activeIndex)
        ? state.activeIndex
        : 0;
    selections[messageId] = Math.max(0, Math.min(index, state.versions.length - 1));
  });
  return selections;
}

function ensureBranchState(conversation, messageId) {
  if (!conversation || !messageId) return null;
  if (!conversation.branches || typeof conversation.branches !== 'object') {
    conversation.branches = {};
  }
  if (!conversation.branches[messageId]) {
    conversation.branches[messageId] = {
      messageId,
      versions: [],
      activeIndex: 0,
    };
  }
  return conversation.branches[messageId];
}

function ensureBranchBaseline(conversation, messageId) {
  const state = ensureBranchState(conversation, messageId);
  if (!state) return null;
  if (!Array.isArray(state.versions) || state.versions.length === 0) {
    const snapshot = cloneMessages(conversation.messages);
    const signature = computeMessageSignature(snapshot);
    const selections = captureBranchSelections(conversation.branches, { [messageId]: 0 });
    state.versions = [
      {
        id: generateId(),
        signature,
        messages: snapshot,
        selections,
        createdAt: new Date().toISOString(),
      },
    ];
    state.activeIndex = 0;
  }
  return state;
}

function commitBranchTransition(conversation, messageId, previousMessages, previousSelections = {}) {
  if (!conversation || !messageId) return;
  const state = ensureBranchState(conversation, messageId);
  if (!state) return;

  const timestamp = new Date().toISOString();
  const previousSnapshot = cloneMessages(previousMessages);
  const previousSignature = computeMessageSignature(previousSnapshot);
  let previousIndex = state.versions.findIndex((version) => version.signature === previousSignature);
  if (previousIndex === -1) {
    state.versions.push({
      id: generateId(),
      signature: previousSignature,
      messages: previousSnapshot,
      selections: { ...previousSelections },
      createdAt: timestamp,
    });
    previousIndex = state.versions.length - 1;
  }

  const nextSnapshot = cloneMessages(conversation.messages);
  const nextSignature = computeMessageSignature(nextSnapshot);
  let nextIndex = state.versions.findIndex((version) => version.signature === nextSignature);
  if (nextIndex === -1) {
    const overrideIndex = state.versions.length;
    const nextSelections = captureBranchSelections(conversation.branches, { [messageId]: overrideIndex });
    state.versions.push({
      id: generateId(),
      signature: nextSignature,
      messages: nextSnapshot,
      selections: nextSelections,
      createdAt: timestamp,
    });
    nextIndex = state.versions.length - 1;
  }

  if (previousIndex !== -1 && nextIndex !== -1 && previousIndex > nextIndex) {
    const [previousVersion] = state.versions.splice(previousIndex, 1);
    state.versions.splice(nextIndex, 0, previousVersion);
    previousIndex = nextIndex;
    nextIndex += 1;
  }

  const boundedNextIndex = Math.max(0, Math.min(nextIndex, state.versions.length - 1));
  state.activeIndex = boundedNextIndex;
  const activeSelections = captureBranchSelections(conversation.branches);
  const activeVersion = state.versions[state.activeIndex];
  if (activeVersion) {
    activeVersion.messages = cloneMessages(conversation.messages);
    activeVersion.signature = computeMessageSignature(activeVersion.messages);
    activeVersion.selections = activeSelections;
    activeVersion.createdAt = activeVersion.createdAt ?? timestamp;
  }
}

function syncActiveBranchSnapshots(conversation) {
  if (!conversation?.branches || typeof conversation.branches !== 'object') return;
  const activeSelections = captureBranchSelections(conversation.branches);
  const snapshot = cloneMessages(conversation.messages);
  const signature = computeMessageSignature(snapshot);
  Object.values(conversation.branches).forEach((state) => {
    if (!state || !Array.isArray(state.versions) || state.versions.length === 0) return;
    const index = Number.isInteger(state.activeIndex) ? state.activeIndex : 0;
    const targetIndex = Math.max(0, Math.min(index, state.versions.length - 1));
    state.activeIndex = targetIndex;
    const version = state.versions[targetIndex];
    if (version) {
      version.messages = cloneMessages(snapshot);
      version.signature = signature;
      version.selections = { ...activeSelections };
    }
  });
}

function refreshMessageBranchNavigation(messageElement, messageId, conversation = getCurrentConversation()) {
  if (!(messageElement instanceof HTMLElement) || !messageId) return;
  const nav = messageElement.querySelector('.branch-navigation');
  if (!(nav instanceof HTMLElement)) return;
  if (messageElement.classList.contains('assistant')) {
    nav.hidden = true;
    return;
  }

  const label = nav.querySelector('.branch-navigation-label');
  const prevButton = nav.querySelector('button[data-direction="prev"]');
  const nextButton = nav.querySelector('button[data-direction="next"]');
  const branchState = conversation?.branches?.[messageId];

  if (!branchState || !Array.isArray(branchState.versions) || branchState.versions.length <= 1) {
    nav.hidden = true;
    if (label) label.textContent = '1/1';
    if (prevButton) prevButton.disabled = true;
    if (nextButton) nextButton.disabled = true;
    return;
  }

  const total = branchState.versions.length;
  const activeIndex = Math.max(
    0,
    Math.min(Number.isInteger(branchState.activeIndex) ? branchState.activeIndex : 0, total - 1),
  );

  nav.hidden = false;
  if (label) {
    label.textContent = `${activeIndex + 1}/${total}`;
  }
  if (prevButton) {
    prevButton.disabled = activeIndex <= 0;
  }
  if (nextButton) {
    nextButton.disabled = activeIndex >= total - 1;
  }
}

function refreshConversationBranchNavigation(conversation = getCurrentConversation()) {
  if (!chatMessages) return;
  const targetConversation = conversation ?? getCurrentConversation();
  const userMessages = chatMessages.querySelectorAll('.message.user');
  userMessages.forEach((element) => {
    const messageId = element?.dataset?.messageId;
    if (messageId) {
      refreshMessageBranchNavigation(element, messageId, targetConversation);
    }
  });
}

function handleBranchNavigation(messageId, delta) {
  if (!messageId || !Number.isInteger(delta)) return;
  const conversation = getCurrentConversation();
  if (!conversation) return;

  const branchState = conversation.branches?.[messageId];
  if (!branchState || !Array.isArray(branchState.versions) || branchState.versions.length === 0) return;

  const currentIndex = Number.isInteger(branchState.activeIndex) ? branchState.activeIndex : 0;
  const nextIndex = currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= branchState.versions.length) return;

  const snapshot = branchState.versions[nextIndex];
  if (!snapshot) return;

  const restoredMessages = cloneMessages(snapshot.messages);
  conversation.messages = restoredMessages;

  const selections = snapshot.selections && typeof snapshot.selections === 'object' ? snapshot.selections : {};
  Object.entries(conversation.branches ?? {}).forEach(([key, state]) => {
    if (!state || !Array.isArray(state.versions) || state.versions.length === 0) return;
    if (key === messageId) return;
    const selection = selections[key];
    if (typeof selection === 'number' && selection >= 0 && selection < state.versions.length) {
      state.activeIndex = selection;
    }
  });

  const selectedIndex = selections[messageId];
  if (typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < branchState.versions.length) {
    branchState.activeIndex = selectedIndex;
  } else {
    branchState.activeIndex = nextIndex;
  }

  conversation.updatedAt = new Date().toISOString();
  bumpConversation(conversation.id);
  syncActiveBranchSnapshots(conversation);
  saveConversationsToStorage();
  renderConversationList();
  renderConversation(conversation);
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

function flashButtonFeedback(button, message, feedback, duration = 1200) {
  if (!(button instanceof HTMLElement)) return;
  flashMessageActionStatus(button, message, duration);
  if (!feedback) return;
  button.dataset.feedback = feedback;
  if (duration > 0) {
    window.setTimeout(() => {
      delete button.dataset.feedback;
    }, duration);
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

  const previousMessages = cloneMessages(conversation.messages);
  const previousSelections = captureBranchSelections(conversation.branches);

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

  commitBranchTransition(conversation, message.id, previousMessages, previousSelections);
  syncActiveBranchSnapshots(conversation);
  saveConversationsToStorage();
  renderConversationList();
  refreshConversationBranchNavigation(conversation);
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

  const previousMessages = cloneMessages(conversation.messages);
  const previousSelections = captureBranchSelections(conversation.branches);
  ensureBranchBaseline(conversation, precedingUserMessage.id);

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

  let branchTransitionCommitted = false;
  const finalizeBranchTransition = () => {
    if (branchTransitionCommitted) return;
    branchTransitionCommitted = true;
    commitBranchTransition(conversation, precedingUserMessage.id, previousMessages, previousSelections);
    syncActiveBranchSnapshots(conversation);
    saveConversationsToStorage();
    renderConversationList();
    refreshConversationBranchNavigation(conversation);
  };

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
    finalizeBranchTransition();
  } catch (error) {
    console.error(error);
    finalizePendingMessage(messageElement, `重新生成失败：${error.message}`, messageId);
    setMessageActionFeedback(button, { status: 'error', message: '刷新失败', duration: 1500 });
    finalizeBranchTransition();
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

  const normalizeMessage = (message) => {
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
  };

  const normalized = {
    id: typeof entry.id === 'string' && entry.id ? entry.id : generateId(),
    title:
      typeof entry.title === 'string' && entry.title.trim().length > 0
        ? entry.title.trim()
        : DEFAULT_CONVERSATION_TITLE,
    createdAt:
      typeof entry.createdAt === 'string' && !Number.isNaN(Date.parse(entry.createdAt))
        ? entry.createdAt
        : now,
    updatedAt:
      typeof entry.updatedAt === 'string' && !Number.isNaN(Date.parse(entry.updatedAt))
        ? entry.updatedAt
        : entry.createdAt ?? now,
    messages: Array.isArray(entry.messages)
      ? entry.messages.map((message) => normalizeMessage(message)).filter(Boolean)
      : [],
    branches: {},
  };

  if (entry.branches && typeof entry.branches === 'object') {
    Object.entries(entry.branches).forEach(([messageId, state]) => {
      if (!state || typeof state !== 'object') return;
      const normalizedState = ensureBranchState({ branches: {} }, messageId);
      normalizedState.activeIndex = Number.isInteger(state.activeIndex) ? state.activeIndex : 0;
      normalizedState.versions = Array.isArray(state.versions)
        ? state.versions
            .map((version) => {
              if (!version || typeof version !== 'object') return null;
              const messages = Array.isArray(version.messages)
                ? version.messages.map((message) => normalizeMessage(message)).filter(Boolean)
                : [];
              const signature = typeof version.signature === 'string'
                ? version.signature
                : computeMessageSignature(messages);
              const selections =
                version.selections && typeof version.selections === 'object'
                  ? Object.entries(version.selections).reduce((acc, [key, value]) => {
                      if (typeof value === 'number' && Number.isFinite(value)) {
                        acc[key] = Math.max(0, Math.floor(value));
                      }
                      return acc;
                    }, {})
                  : {};
              const createdAt =
                typeof version.createdAt === 'string' && !Number.isNaN(Date.parse(version.createdAt))
                  ? version.createdAt
                  : now;
              return {
                id: typeof version.id === 'string' && version.id ? version.id : generateId(),
                messages,
                signature,
                selections,
                createdAt,
              };
            })
            .filter(Boolean)
        : [];

      if (normalizedState.versions.length > 0) {
        const boundedIndex = Math.max(0, Math.min(normalizedState.activeIndex, normalizedState.versions.length - 1));
        normalizedState.activeIndex = boundedIndex;
        normalized.branches[messageId] = normalizedState;
      }
    });
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
        conversations.forEach((conversation) => {
          syncActiveBranchSnapshots(conversation);
        });
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
    branches: {},
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
  refreshConversationBranchNavigation(target);

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
  syncActiveBranchSnapshots(conversation);
  saveConversationsToStorage();
  renderConversationList();
  return message.id;
}

function resolvePendingConversationMessage(messageId, content) {
  if (!messageId) return;
  const timestamp = new Date().toISOString();
  const conversation = conversations.find(c => c.messages.some(m => m.id === messageId));
  if (!conversation) return;

  const messageIndex = conversation.messages.findIndex((entry) => entry.id === messageId);
  if (messageIndex === -1) return;
  const message = conversation.messages[messageIndex];
  message.content = typeof content === 'string' ? content : '';
  message.pending = false;
  message.timestamp = timestamp;
  conversation.updatedAt = timestamp;

  const precedingUserMessage = findPreviousUserMessage(conversation, messageIndex);
  if (precedingUserMessage) {
    ensureBranchBaseline(conversation, precedingUserMessage.id);
  }

  bumpConversation(conversation.id);
  syncActiveBranchSnapshots(conversation);
  saveConversationsToStorage();
  renderConversationList();
  refreshConversationBranchNavigation(conversation);
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

  const footer = document.createElement('div');
  footer.className = 'message-footer';

  const branchNavigation = document.createElement('div');
  branchNavigation.className = 'branch-navigation';
  if (role !== 'user') {
    branchNavigation.hidden = true;
  } else {
    const prevButton = document.createElement('button');
    prevButton.type = 'button';
    prevButton.className = 'branch-nav-button';
    prevButton.dataset.direction = 'prev';
    prevButton.textContent = '<';
    prevButton.setAttribute('aria-label', '查看上一版本');
    prevButton.disabled = true;

    const label = document.createElement('span');
    label.className = 'branch-navigation-label';
    label.textContent = '1/1';

    const nextButton = document.createElement('button');
    nextButton.type = 'button';
    nextButton.className = 'branch-nav-button';
    nextButton.dataset.direction = 'next';
    nextButton.textContent = '>';
    nextButton.setAttribute('aria-label', '查看下一版本');
    nextButton.disabled = true;

    branchNavigation.append(prevButton, label, nextButton);
  }

  footer.append(branchNavigation, actions);

  message.append(header, body, footer);

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
    if (role === 'user') {
      refreshMessageBranchNavigation(messageElement, messageId);
    }
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
    const origin = event.target instanceof HTMLElement ? event.target : null;
    if (!origin) return;

    const navButton = origin.closest('button.branch-nav-button');
    if (navButton instanceof HTMLElement && chatMessages.contains(navButton)) {
      event.preventDefault();
      event.stopPropagation();
      const direction = navButton.dataset.direction;
      const messageElement = navButton.closest('.message');
      const messageId = messageElement?.dataset?.messageId;
      if (messageId && (direction === 'prev' || direction === 'next')) {
        const delta = direction === 'prev' ? -1 : 1;
        handleBranchNavigation(messageId, delta);
      }
      return;
    }

    const target = origin.closest('button.message-action');
    if (!target || !chatMessages.contains(target)) return;

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
