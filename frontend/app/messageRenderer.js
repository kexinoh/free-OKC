import { cloneMessageActionIcon } from '../messageActionIcons.js';
import { renderMarkdown } from '../markdown.js';
import {
  appendMessageToConversation,
  resolvePendingConversationMessage,
  getCurrentConversation,
} from '../conversationState.js';
import { restoreModelLogs, updateWebPreview, updatePptPreview } from '../previews.js';

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

export function createMessageRenderer({
  chatMessages,
  userInput,
  sendButton,
  editingController,
  messageActions,
  onConversationListUpdated,
}) {
  let lastRenderedConversationId = null;

  const findMessageElementById = (messageId) => {
    if (!chatMessages || !messageId) {
      return null;
    }
    const candidates = chatMessages.querySelectorAll('[data-message-id]');
    for (const element of candidates) {
      if (element instanceof HTMLElement && element.dataset.messageId === messageId) {
        return element;
      }
    }
    return null;
  };

  const setMessageContent = (messageElement, text) => {
    if (!(messageElement instanceof HTMLElement)) return;
    const body = messageElement.querySelector('.message-content');
    if (!(body instanceof HTMLElement)) return;

    const normalized = typeof text === 'string' ? text : '';

    if (messageElement.dataset) {
      messageElement.dataset.contentRaw = normalized;
    }

    if (messageElement.classList.contains('assistant')) {
      body.innerHTML = renderMarkdown(normalized);
    } else {
      body.textContent = normalized;
    }

    body.classList.remove('pending');
  };

  const markMessagePending = (messageElement, placeholderText) => {
    if (!(messageElement instanceof HTMLElement)) return;
    messageElement.dataset.pending = 'true';
    messageElement.classList.add('pending');
    if (messageElement.dataset) {
      messageElement.dataset.contentRaw = '';
    }
    const body = messageElement.querySelector('.message-content');
    if (body) {
      body.classList.add('pending');
      body.textContent = placeholderText ?? '正在生成回复…';
    }
    messageActions.setMessageActionsDisabled(messageElement, true);
  };

  const refreshMessageBranchNavigation = (messageElement, messageId, conversation = getCurrentConversation()) => {
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
  };

  const refreshConversationBranchNavigation = (conversation = getCurrentConversation()) => {
    if (!chatMessages) return;
    const targetConversation = conversation ?? getCurrentConversation();
    const userMessages = chatMessages.querySelectorAll('.message.user');
    userMessages.forEach((element) => {
      const messageId = element?.dataset?.messageId;
      if (messageId) {
        refreshMessageBranchNavigation(element, messageId, targetConversation);
      }
    });
  };

  const createMessageElement = (role, text, options = {}) => {
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

    const body = document.createElement('div');
    body.className = 'message-content';
    const initialText = typeof text === 'string' ? text : '';
    message.append(header, body);
    setMessageContent(message, initialText);

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
    message.append(footer);

    if (pending) {
      markMessagePending(message, body.textContent || '正在生成回复…');
    } else {
      messageActions.setMessageActionsDisabled(message, false);
    }
    return message;
  };

  const addMessage = (role, text, options = {}) => {
    if (!chatMessages) return null;
    const message = createMessageElement(role, text, options);
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return message;
  };

  const addAndRenderMessage = (role, text, options = {}) => {
    const messageId = appendMessageToConversation(role, text, options);
    const messageElement = addMessage(role, text, options);
    if (messageElement instanceof HTMLElement && messageId) {
      messageElement.dataset.messageId = messageId;
      if (role === 'user') {
        refreshMessageBranchNavigation(messageElement, messageId);
      }
    }
    return { messageId, messageElement };
  };

  const createReasoningDetails = (reasoningOptions) => {
    if (!reasoningOptions || typeof reasoningOptions !== 'object') {
      return null;
    }

    const { toolContainer, statusElement } = reasoningOptions;

    if (statusElement instanceof HTMLElement) {
      statusElement.textContent = '推理完成';
      statusElement.dataset.status = 'done';
    }

    if (!(toolContainer instanceof HTMLElement)) {
      return null;
    }

    const steps = Array.from(toolContainer.children);
    if (steps.length === 0) {
      return null;
    }

    const details = document.createElement('details');
    details.className = 'reasoning-details';
    details.open = false;

    const summary = document.createElement('summary');
    const stepCount = steps.length;
    summary.textContent = stepCount > 0 ? `推理完成（共${stepCount}步，点击展开）` : '推理完成（点击展开）';
    details.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'reasoning-details-body';

    const historyContainer = document.createElement('div');
    historyContainer.className = 'tool-status-container';
    steps.forEach((node) => {
      historyContainer.appendChild(node.cloneNode(true));
    });

    body.appendChild(historyContainer);
    details.appendChild(body);
    return details;
  };

  const finalizePendingMessage = (message, text, messageId, options = {}) => {
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

    const reasoningDetails = createReasoningDetails(options.reasoning ?? null);

    setMessageContent(message, finalText);

    message.classList.remove('pending');
    if (message.dataset) {
      delete message.dataset.pending;
      message.dataset.contentRaw = finalText;
    }
    message.removeAttribute('data-pending');
    messageActions.setMessageActionsDisabled(message, false);

    if (reasoningDetails) {
      const body = message.querySelector('.message-content');
      if (body instanceof HTMLElement) {
        body.appendChild(reasoningDetails);
      }
    }

    if (messageId) {
      const conversation = resolvePendingConversationMessage(messageId, finalText);
      if (conversation) {
        refreshConversationBranchNavigation(conversation);
        if (typeof onConversationListUpdated === 'function') {
          onConversationListUpdated();
        }
      }
    }
  };

  const applyConversationOutputs = (conversation) => {
    if (!conversation || typeof conversation !== 'object') {
      restoreModelLogs([]);
      updateWebPreview(null);
      updatePptPreview([]);
      return;
    }

    const outputs =
      conversation && typeof conversation.outputs === 'object' ? conversation.outputs : null;
    const logs = Array.isArray(outputs?.modelLogs) ? outputs.modelLogs : [];
    const webPreview = outputs?.webPreview ?? null;
    const slides = Array.isArray(outputs?.pptSlides) ? outputs.pptSlides : [];

    restoreModelLogs(logs);
    updateWebPreview(webPreview);
    updatePptPreview(slides);
  };

  const renderConversation = (conversation) => {
    if (!chatMessages) return;
    const target = conversation ?? getCurrentConversation();

    if (editingController.isEditing()) {
      editingController.cancelActiveEdit({ focusInput: false });
    }

    if (!target) {
      chatMessages.innerHTML = '';
      lastRenderedConversationId = null;
      applyConversationOutputs(null);
      return;
    }

    const isDifferentConversation = target.id !== lastRenderedConversationId;
    if (isDifferentConversation) {
      applyConversationOutputs(target);
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
    if (sendButton) {
      sendButton.disabled = false;
    }
  };

  return {
    findMessageElementById,
    addAndRenderMessage,
    markMessagePending,
    finalizePendingMessage,
    refreshConversationBranchNavigation,
    renderConversation,
    get lastRenderedConversationId() {
      return lastRenderedConversationId;
    },
  };
}
