import { cloneMessageActionIcon } from './messageActionIcons.js';
import {
  chatMessages,
  chatForm,
  userInput,
  statusPill,
  configForm,
  settingsToggle,
  settingsOverlay,
  settingsDrawer,
  settingsCloseButtons,
  historySidebar,
  historyToggle,
  historyPanel,
  conversationList,
  conversationEmptyState,
  newConversationButton,
} from './elements.js';
import { DEFAULT_CONVERSATION_TITLE } from './constants.js';
import {
  getConversations,
  getCurrentConversation,
  getCurrentSessionId,
  setCurrentSessionId,
  ensureCurrentConversation,
  createConversation,
  appendMessageToConversation,
  resolvePendingConversationMessage,
  findConversationByMessageId,
  findPreviousUserMessage,
  captureBranchSelections,
  ensureBranchBaseline,
  commitBranchTransition,
  syncActiveBranchSnapshots,
  loadConversationsFromStorage,
  saveConversationsToStorage,
  bumpConversation,
  generateConversationTitle,
} from './conversationState.js';
import { formatConversationTime, fetchJson } from './utils.js';
import {
  logModelInvocation,
  updateWebPreview,
  updatePptPreview,
  initializePreviewControls,
  resetModelLogs,
  resetPreviews,
} from './previews.js';
import { loadConfig, initializeConfigForm } from './config.js';

let previousFocusedElement = null;
let lastRenderedConversationId = null;

const messageActionStatusTimers = new WeakMap();
const messageActionFeedbackTimers = new WeakMap();

function setInteractionDisabled(disabled) {
  if (userInput) {
    userInput.disabled = disabled;
  }
  const submitButton = chatForm?.querySelector('button');
  if (submitButton) {
    submitButton.disabled = disabled;
  }
}

function setStatus(text, busy = false) {
  if (!statusPill) return;
  statusPill.textContent = text;
  statusPill.dataset.busy = busy ? 'true' : 'false';
}

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

  const restoredMessages = snapshot.messages.map((entry) => ({ ...entry }));
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

function createMessageElement(role, text, options = {}) {
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
  body.textContent = typeof text === 'string' && text.length > 0 ? text : '';

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
  return message;
}

function addMessage(role, text, options = {}) {
  if (!chatMessages) return null;
  const message = createMessageElement(role, text, options);
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
      const conversation = resolvePendingConversationMessage(messageId, finalText);
      if (conversation && conversation.id === lastRenderedConversationId) {
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
    const conversation = resolvePendingConversationMessage(messageId, finalText);
    if (conversation) {
      refreshConversationBranchNavigation(conversation);
      renderConversationList();
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

  const previousMessages = conversation.messages.map((entry) => ({ ...entry }));
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

  const title = generateConversationTitle(normalized);
  if (title) {
    conversation.title = title;
  }

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

  const previousMessages = conversation.messages.map((entry) => ({ ...entry }));
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

function renderConversationList() {
  if (!conversationList) return;
  conversationList.innerHTML = '';
  const conversations = getConversations();

  if (conversations.length === 0) {
    if (conversationEmptyState) {
      conversationEmptyState.hidden = false;
    }
    return;
  }

  if (conversationEmptyState) {
    conversationEmptyState.hidden = true;
  }

  const currentSessionId = getCurrentSessionId();

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
  resetModelLogs();
  resetPreviews();
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

function initializeConversationState() {
  loadConversationsFromStorage();
  ensureCurrentConversation();
  renderConversationList();
  renderConversation();
  return getCurrentConversation();
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

function closeHistoryOnMobile() {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mediaQuery = window.matchMedia('(max-width: 1080px)');
    if (mediaQuery.matches) {
      setHistoryOpen(false);
      historyToggle?.focus();
    }
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

function selectConversation(conversationId) {
  if (!conversationId) return;
  const conversation = getConversations().find((entry) => entry.id === conversationId);
  if (!conversation) return;

  setCurrentSessionId(conversation.id);
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
  renderConversationList();
  renderConversation(conversation);

  closeHistoryOnMobile();

  setStatus('连接工作台…', true);
  bootSession();
}

async function deleteSessionHistory() {
  return fetchJson('/api/session/history', { method: 'DELETE' });
}

async function deleteConversation(conversationId) {
  if (!conversationId) return;
  const conversations = getConversations();
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index === -1) return;

  const [removed] = conversations.splice(index, 1);
  const wasCurrent = removed.id === getCurrentSessionId();

  if (wasCurrent) {
    setCurrentSessionId(null);
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
    setCurrentSessionId(removed.id);
    saveConversationsToStorage();
    renderConversationList();
    selectConversation(removed.id);
    addAndRenderMessage('assistant', `清理会话失败：${error.message || '未知错误'}`);
    return;
  }

  const conversation = createConversation();
  renderConversationList();
  renderConversation(conversation);
  closeHistoryOnMobile();
  setStatus('连接工作台…', true);
  bootSession();
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
    if (userInput) {
      userInput.value = '';
      userInput.focus();
    }
  }
}

function handleUserSubmit(event) {
  event.preventDefault();
  const value = userInput.value.trim();
  if (!value) return;
  addAndRenderMessage('user', value);
  sendChat(value);
}

function initializeEventListeners() {
  if (chatForm) {
    chatForm.addEventListener('submit', handleUserSubmit);
  }

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
}

document.addEventListener('DOMContentLoaded', () => {
  initializePreviewControls();
  initializeConfigForm();
  initializeEventListeners();

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
