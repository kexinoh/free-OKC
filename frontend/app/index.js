import {
  chatMessages,
  chatForm,
  userInput,
  cancelEditButton,
  chatEditingHint,
  chatPanel,
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
} from '../elements.js';
import {
  getConversations,
  getCurrentConversation,
  findConversationByMessageId,
  findPreviousUserMessage,
  captureBranchSelections,
  ensureBranchBaseline,
  commitBranchTransition,
  syncActiveBranchSnapshots,
  saveConversationsToStorage,
  bumpConversation,
  generateConversationTitle,
} from '../conversationState.js';
import { fetchJson } from '../utils.js';
import {
  logModelInvocation,
  updateWebPreview,
  updatePptPreview,
  initializePreviewControls,
} from '../previews.js';
import { loadConfig, initializeConfigForm } from '../config.js';
import { setMessageActionStatus, setMessageActionFeedback, setMessageActionsDisabled } from './messageActions.js';
import { createEditingController } from './editingController.js';
import { createHistoryLayoutManager } from './historyLayout.js';
import { createMessageRenderer } from './messageRenderer.js';
import { createStreamingController } from './streamingController.js';
import { createConversationPanel } from './conversationPanel.js';

let previousFocusedElement = null;

const historyLayout = createHistoryLayoutManager({ historySidebar, chatPanel, chatMessages });
const sendButton = chatForm?.querySelector('.send-button') ?? null;

const defaultSendButtonLabel = sendButton?.textContent?.trim() || '发送';
const defaultInputPlaceholder = userInput?.getAttribute('placeholder') ?? '';
const editingHintFallback = '正在编辑历史消息，点击“保存”完成修改。';
const editingHintInitial = chatEditingHint?.textContent?.trim();
const defaultEditingHintText =
  editingHintInitial && editingHintInitial.length > 0 ? editingHintInitial : editingHintFallback;

if (chatEditingHint && (!editingHintInitial || editingHintInitial.length === 0)) {
  chatEditingHint.textContent = defaultEditingHintText;
}

let messageRendererApi = null;
let conversationPanelApi = null;

const editingController = createEditingController({
  chatForm,
  userInput,
  sendButton,
  cancelEditButton,
  chatEditingHint,
  defaultSendButtonLabel,
  defaultInputPlaceholder,
  defaultEditingHintText,
  findMessageElementById: (messageId) => messageRendererApi?.findMessageElementById(messageId) ?? null,
  renderConversationList: () => conversationPanelApi?.renderConversationList(),
  refreshConversationBranchNavigation: (conversation) =>
    messageRendererApi?.refreshConversationBranchNavigation(conversation),
  getConversations,
  bumpConversation,
  generateConversationTitle,
  commitBranchTransition,
  syncActiveBranchSnapshots,
  saveConversationsToStorage,
});

messageRendererApi = createMessageRenderer({
  chatMessages,
  userInput,
  sendButton,
  editingController,
  messageActions: {
    setMessageActionsDisabled,
  },
  onConversationListUpdated: () => conversationPanelApi?.renderConversationList(),
});

const streamingController = createStreamingController({
  finalizePendingMessage: (message, text, messageId) =>
    messageRendererApi.finalizePendingMessage(message, text, messageId),
});

conversationPanelApi = createConversationPanel({
  conversationList,
  conversationEmptyState,
  historySidebar,
  historyToggle,
  historyPanel,
  setStatus: (text, busy) => setStatus(text, busy),
  renderConversation: (conversation) => messageRendererApi.renderConversation(conversation),
  addAndRenderMessage: (role, text, options) =>
    messageRendererApi.addAndRenderMessage(role, text, options),
  requestHistoryLayoutSync: () => historyLayout.requestLayoutSync(),
  onSessionReset: () => bootSession(),
});

function setInteractionDisabled(disabled) {
  if (userInput) {
    userInput.disabled = disabled;
  }
  if (sendButton) {
    sendButton.disabled = disabled;
  }
  if (cancelEditButton) {
    cancelEditButton.disabled = disabled;
  }
}

function setStatus(text, busy = false) {
  if (!statusPill) return;
  statusPill.textContent = text;
  statusPill.dataset.busy = busy ? 'true' : 'false';
  historyLayout.requestLayoutSync();
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
  conversationPanelApi.renderConversationList();
  messageRendererApi.renderConversation(conversation);
}

async function handleCopyMessageAction(messageId, button, messageElement) {
  if (!button) return;

  let content = '';

  if (messageElement?.dataset?.contentRaw) {
    content = messageElement.dataset.contentRaw;
  }

  const match = findConversationByMessageId(messageId);
  if (match) {
    const { conversation, messageIndex } = match;
    const message = conversation.messages[messageIndex];
    if (typeof message?.content === 'string' && message.content.length > 0) {
      content = message.content;
    }
  }

  if (!content && messageElement instanceof HTMLElement) {
    const body = messageElement.querySelector('.message-content');
    if (body) {
      content = body.innerText ?? body.textContent ?? '';
    }
  }

  if (!content) {
    setMessageActionFeedback(button, { status: 'error', message: '没有可复制的内容', duration: 1500 });
    return;
  }

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

  const body = messageElement.querySelector('.message-content');
  const currentContent = typeof message.content === 'string' ? message.content : body?.textContent ?? '';
  const currentNormalized = (currentContent ?? '').replace(/\r\n/g, '\n');

  editingController.enterEditModeForMessage({
    conversation,
    message,
    initialValue: currentNormalized,
    previousMessages,
    previousSelections,
  });
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
  messageRendererApi.markMessagePending(messageElement, placeholder);

  const timestamp = new Date().toISOString();
  assistantMessage.pending = true;
  assistantMessage.content = '';
  assistantMessage.timestamp = timestamp;
  conversation.updatedAt = timestamp;
  bumpConversation(conversation.id);
  saveConversationsToStorage();
  conversationPanelApi.renderConversationList();

  let branchTransitionCommitted = false;
  const finalizeBranchTransition = () => {
    if (branchTransitionCommitted) return;
    branchTransitionCommitted = true;
    commitBranchTransition(conversation, precedingUserMessage.id, previousMessages, previousSelections);
    syncActiveBranchSnapshots(conversation);
    saveConversationsToStorage();
    conversationPanelApi.renderConversationList();
    messageRendererApi.refreshConversationBranchNavigation(conversation);
  };

  try {
    const payload = await streamingController.runAssistantStream(messageElement, messageId, {
      message: precedingUserMessage.content,
      replace_last: true,
    });
    if (payload.meta) {
      logModelInvocation(payload.meta);
    }
    updateWebPreview(payload.web_preview);
    updatePptPreview(payload.ppt_slides);
    setMessageActionFeedback(button, { status: 'success', message: '已刷新', duration: 1500 });
    finalizeBranchTransition();
  } catch (error) {
    console.error(error);
    messageRendererApi.finalizePendingMessage(
      messageElement,
      `重新生成失败：${error?.message || '未知错误'}`,
      messageId,
    );
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

function resolveUserInputField(form) {
  if (form instanceof HTMLFormElement) {
    const fallback = form.querySelector('#user-input, textarea[name="message"]');
    if (fallback instanceof HTMLTextAreaElement || fallback instanceof HTMLInputElement) {
      return fallback;
    }
  }
  const globalFallback = document.getElementById('user-input');
  return globalFallback instanceof HTMLTextAreaElement || globalFallback instanceof HTMLInputElement
    ? globalFallback
    : null;
}

async function bootSession() {
  try {
    const data = await fetchJson('/api/session/boot');
    messageRendererApi.addAndRenderMessage('assistant', data.reply);
    logModelInvocation(data.meta);
  } catch (error) {
    console.error(error);
    messageRendererApi.addAndRenderMessage('assistant', '无法连接到后端服务，请确认已启动。');
  } finally {
    setStatus('待命中…');
  }
}

async function sendChat(message) {
  setStatus('创意生成中…', true);
  setInteractionDisabled(true);
  const { messageId: pendingMessageId, messageElement: pendingMessage } =
    messageRendererApi.addAndRenderMessage('assistant', '正在生成回复…', { pending: true });
  try {
    const payload = await streamingController.runAssistantStream(pendingMessage, pendingMessageId, { message });
    logModelInvocation(payload.meta);
    updateWebPreview(payload.web_preview);
    updatePptPreview(payload.ppt_slides);
  } catch (error) {
    console.error(error);
    messageRendererApi.finalizePendingMessage(
      pendingMessage,
      `抱歉，发生错误：${error?.message || '未知错误'}`,
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
  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : chatForm;
  const input = resolveUserInputField(form);
  if (!input) return;
  const rawValue = typeof input.value === 'string' ? input.value : '';

  if (editingController.isEditing()) {
    editingController.applyActiveEdit(rawValue);
    return;
  }

  const value = rawValue.trim();
  if (!value) return;
  messageRendererApi.addAndRenderMessage('user', value);
  sendChat(value);
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

function initializeEventListeners() {
  if (chatForm) {
    chatForm.addEventListener('submit', handleUserSubmit);
  }

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', () => {
      editingController.cancelActiveEdit({ focusInput: true });
    });
  }

  if (chatMessages) {
    chatMessages.addEventListener('click', async (event) => {
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
          await handleCopyMessageAction(messageId, target, messageElement);
          break;
        case 'edit':
          handleEditMessageAction(messageElement, messageId);
          break;
        case 'refresh':
          await regenerateAssistantMessage(messageElement, messageId, target);
          break;
        default:
          break;
      }
    });
  }

  if (historyToggle) {
    historyToggle.addEventListener('click', () => {
      const isOpen = conversationPanelApi.toggleHistoryPanel();
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
          conversationPanelApi.deleteConversation(conversationId).catch((error) => console.error(error));
        }
        return;
      }

      const conversationButton = target.closest('.conversation-item');
      if (!conversationButton || !conversationList.contains(conversationButton)) return;

      const { conversationId } = conversationButton.dataset;
      if (conversationId) {
        conversationPanelApi.selectConversation(conversationId);
      }
    });
  }

  if (newConversationButton) {
    newConversationButton.addEventListener('click', () => {
      conversationPanelApi.startNewConversation().catch((error) => console.error(error));
    });
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
    if (editingController.isEditing()) {
      event.preventDefault();
      editingController.cancelActiveEdit({ focusInput: true });
      return;
    }
    if (!settingsOverlay?.hidden) {
      event.preventDefault();
      closeSettingsPanel();
      return;
    }
    if (conversationPanelApi.isHistoryOpen()) {
      event.preventDefault();
      conversationPanelApi.setHistoryOpen(false);
      historyToggle?.focus();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initializePreviewControls();
  initializeConfigForm();
  initializeEventListeners();

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', historyLayout.requestLayoutSync);
  }

  const observedChatPanel = chatPanel instanceof HTMLElement ? chatPanel : chatMessages?.closest('.chat-panel');
  historyLayout.observe(observedChatPanel);
  historyLayout.requestLayoutSync();

  const conversation = conversationPanelApi.initializeConversationState();
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
