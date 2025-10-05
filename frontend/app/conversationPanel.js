import { DEFAULT_CONVERSATION_TITLE } from '../constants.js';
import {
  getConversations,
  getCurrentConversation,
  getCurrentSessionId,
  setCurrentSessionId,
  ensureCurrentConversation,
  createConversation,
  loadConversationsFromStorage,
  discardConversation,
  restoreConversation,
} from '../conversationState.js';
import { formatConversationTime, fetchJson } from '../utils.js';

export function createConversationPanel({
  conversationList,
  conversationEmptyState,
  historySidebar,
  historyToggle,
  historyPanel,
  setStatus,
  renderConversation,
  addAndRenderMessage,
  requestHistoryLayoutSync,
  onSessionReset,
}) {
  const renderConversationList = () => {
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
  };

  const isHistoryOpen = () => historySidebar?.classList.contains('open') ?? false;

  const updateHistoryToggleIcon = (isOpen) => {
    if (!historyToggle) return;
    historyToggle.setAttribute(
      'aria-label',
      isOpen ? '收起历史会话侧栏' : '展开历史会话侧栏',
    );
  };

  const setHistoryOpen = (shouldOpen) => {
    if (!historySidebar || !historyToggle) return false;
    if (shouldOpen) {
      historySidebar.classList.add('open');
    } else {
      historySidebar.classList.remove('open');
    }
    historyToggle.setAttribute('aria-expanded', String(shouldOpen));
    updateHistoryToggleIcon(shouldOpen);
    if (shouldOpen) {
      historyPanel?.focus();
    }
    requestHistoryLayoutSync();
    return shouldOpen;
  };

  const toggleHistoryPanel = (force) => {
    if (!historySidebar || !historyToggle) return false;
    const targetState = typeof force === 'boolean' ? force : !isHistoryOpen();
    return setHistoryOpen(targetState);
  };

  const closeHistoryOnMobile = () => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mediaQuery = window.matchMedia('(max-width: 1080px)');
      if (mediaQuery.matches) {
        setHistoryOpen(false);
        historyToggle?.focus();
      }
    }
  };

  const deleteSessionHistory = async () => fetchJson('/api/session/history', { method: 'DELETE' });

  const selectConversation = (conversationId) => {
    if (!conversationId) return;
    const conversation = getConversations().find((entry) => entry.id === conversationId);
    if (!conversation) return;

    setCurrentSessionId(conversation.id);
    renderConversationList();
    renderConversation(conversation);

    closeHistoryOnMobile();

    setStatus('待命中…');
  };

  const startNewConversation = async () => {
    setStatus('清理工作台…', true);

    try {
      await deleteSessionHistory();
    } catch (error) {
      console.error(error);
      setStatus('待命中…');
      addAndRenderMessage('assistant', `无法重置会话：${error?.message || '未知错误'}`);
      return;
    }

    const conversation = createConversation();
    renderConversationList();
    renderConversation(conversation);

    closeHistoryOnMobile();

    setStatus('连接工作台…', true);
    if (typeof onSessionReset === 'function') {
      onSessionReset();
    }
  };

  const deleteConversation = async (conversationId) => {
    if (!conversationId) return;
    const removal = discardConversation(conversationId);
    if (!removal) return;

    const { conversation: removed, index } = removal;
    const wasCurrent = removed?.id === getCurrentSessionId();

    if (wasCurrent) {
      setCurrentSessionId(null);
      setStatus('清理会话…', true);
    }

    renderConversationList();

    if (!wasCurrent) {
      return;
    }

    renderConversation(null);

    try {
      await deleteSessionHistory();
    } catch (error) {
      console.error(error);
      restoreConversation(removed, index ?? 0);
      if (removed?.id) {
        setCurrentSessionId(removed.id);
        renderConversationList();
        selectConversation(removed.id);
      }
      addAndRenderMessage('assistant', `清理会话失败：${error?.message || '未知错误'}`);
      return;
    }

    const conversation = createConversation();
    renderConversationList();
    renderConversation(conversation);
    closeHistoryOnMobile();
    setStatus('连接工作台…', true);
    if (typeof onSessionReset === 'function') {
      onSessionReset();
    }
  };

  const initializeConversationState = async () => {
    await loadConversationsFromStorage();
    ensureCurrentConversation();
    renderConversationList();
    renderConversation();
    return getCurrentConversation();
  };

  updateHistoryToggleIcon(isHistoryOpen());

  return {
    renderConversationList,
    isHistoryOpen,
    setHistoryOpen,
    toggleHistoryPanel,
    startNewConversation,
    deleteConversation,
    selectConversation,
    initializeConversationState,
    closeHistoryOnMobile,
  };
}
