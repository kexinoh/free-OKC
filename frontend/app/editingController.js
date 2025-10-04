export function createEditingController({
  chatForm,
  userInput,
  sendButton,
  chatEditingHint,
  defaultEditingHintText,
  findMessageElementById,
  renderConversationList,
  refreshConversationBranchNavigation,
  getConversations,
  bumpConversation,
  generateConversationTitle,
  commitBranchTransition,
  syncActiveBranchSnapshots,
  saveConversationsToStorage,
  setMessageActionsDisabled,
}) {
  let activeEditState = null;

  const resetChatEditingUi = () => {
    const interactionsDisabled = chatForm?.dataset?.interactionDisabled === 'true';

    if (sendButton) {
      sendButton.disabled = interactionsDisabled;
    }

    if (chatEditingHint) {
      chatEditingHint.hidden = true;
      if (defaultEditingHintText) {
        chatEditingHint.textContent = defaultEditingHintText;
      }
    }
  };

  const prepareChatEditingUi = () => {
    if (sendButton) {
      sendButton.disabled = true;
    }

    if (chatEditingHint) {
      if (defaultEditingHintText) {
        chatEditingHint.textContent = defaultEditingHintText;
      }
      chatEditingHint.hidden = false;
    }
  };

  const focusTextareaEnd = (textarea) => {
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    try {
      const length = textarea.value.length;
      textarea.focus();
      textarea.setSelectionRange(length, length);
    } catch (error) {
      textarea.focus();
    }
  };

  const cleanupActiveEditor = () => {
    if (!activeEditState) return;

    const {
      editorContainer,
      textarea,
      keydownHandler,
      messageElement,
      body,
      cancelHandler,
      saveHandler,
      cancelButton,
      saveButton,
    } = activeEditState;

    if (textarea instanceof HTMLTextAreaElement && typeof keydownHandler === 'function') {
      textarea.removeEventListener('keydown', keydownHandler);
    }

    if (cancelButton instanceof HTMLElement && typeof cancelHandler === 'function') {
      cancelButton.removeEventListener('click', cancelHandler);
    }

    if (saveButton instanceof HTMLElement && typeof saveHandler === 'function') {
      saveButton.removeEventListener('click', saveHandler);
    }

    if (editorContainer?.parentNode) {
      editorContainer.remove();
    }

    if (body instanceof HTMLElement) {
      body.hidden = false;
    }

    if (messageElement instanceof HTMLElement) {
      messageElement.classList.remove('editing');
      if (typeof setMessageActionsDisabled === 'function') {
        setMessageActionsDisabled(messageElement, false);
      }
      const actions = messageElement.querySelector('.message-actions');
      if (actions instanceof HTMLElement) {
        actions.hidden = false;
      }
    }

    activeEditState = null;
  };

  const isEditing = () => activeEditState !== null;

  const cancelActiveEdit = ({ focusInput = false, focusEditButton = true } = {}) => {
    if (!isEditing()) {
      resetChatEditingUi();
      if (focusInput && userInput instanceof HTMLElement) {
        userInput.focus();
      }
      return;
    }

    const { messageElement } = activeEditState;
    cleanupActiveEditor();
    resetChatEditingUi();

    if (focusEditButton && messageElement instanceof HTMLElement) {
      const editButton = messageElement.querySelector('button[data-action="edit"]');
      if (editButton instanceof HTMLElement) {
        editButton.focus();
      }
    } else if (focusInput && userInput instanceof HTMLElement) {
      userInput.focus();
    }
  };

  const enterEditModeForMessage = ({
    conversation,
    message,
    initialValue,
    previousMessages,
    previousSelections,
  }) => {
    if (!conversation || !message) {
      return;
    }

    const messageElement = findMessageElementById(message.id);
    if (!(messageElement instanceof HTMLElement)) {
      return;
    }

    if (isEditing()) {
      cancelActiveEdit({ focusInput: false, focusEditButton: false });
    }

    const body = messageElement.querySelector('.message-content');
    if (!(body instanceof HTMLElement)) {
      return;
    }

    const actions = messageElement.querySelector('.message-actions');
    if (actions instanceof HTMLElement) {
      actions.hidden = true;
    }

    if (typeof setMessageActionsDisabled === 'function') {
      setMessageActionsDisabled(messageElement, true);
    }

    const editorContainer = document.createElement('div');
    editorContainer.className = 'message-edit-container';

    const textarea = document.createElement('textarea');
    textarea.className = 'message-edit-textarea';
    textarea.value = typeof initialValue === 'string' ? initialValue : '';

    const controls = document.createElement('div');
    controls.className = 'message-edit-actions';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'ghost-button message-edit-cancel';
    cancelButton.textContent = '取消';

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'primary-button message-edit-save';
    saveButton.textContent = '发送';

    controls.append(cancelButton, saveButton);
    editorContainer.append(textarea, controls);

    body.hidden = true;
    body.insertAdjacentElement('afterend', editorContainer);
    messageElement.classList.add('editing');

    prepareChatEditingUi();

    const keydownHandler = (event) => {
      if (event.key !== 'Enter') return;
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      applyActiveEdit(textarea.value);
    };

    const cancelHandler = () => {
      cancelActiveEdit({ focusInput: true, focusEditButton: false });
    };

    const saveHandler = () => {
      applyActiveEdit(textarea.value);
    };

    textarea.addEventListener('keydown', keydownHandler);
    cancelButton.addEventListener('click', cancelHandler);
    saveButton.addEventListener('click', saveHandler);

    activeEditState = {
      conversationId: conversation.id,
      messageId: message.id,
      previousMessages,
      previousSelections,
      messageElement,
      body,
      editorContainer,
      textarea,
      keydownHandler,
      cancelHandler,
      saveHandler,
      cancelButton,
      saveButton,
    };

    window.requestAnimationFrame(() => {
      focusTextareaEnd(textarea);
    });
  };

  const applyActiveEdit = (nextContentRaw) => {
    if (!isEditing()) {
      return;
    }

    const { conversationId, messageId, previousMessages, previousSelections, messageElement, body } =
      activeEditState;

    const conversation = getConversations().find((entry) => entry.id === conversationId);
    if (!conversation) {
      cancelActiveEdit({ focusInput: false, focusEditButton: false });
      return;
    }

    const messageIndex = conversation.messages.findIndex((entry) => entry.id === messageId);
    if (messageIndex === -1) {
      cancelActiveEdit({ focusInput: false, focusEditButton: false });
      return;
    }

    const message = conversation.messages[messageIndex];
    const normalizedCurrent =
      typeof message.content === 'string' ? message.content.replace(/\r\n/g, '\n') : '';
    const normalizedNext =
      typeof nextContentRaw === 'string' ? nextContentRaw.replace(/\r\n/g, '\n') : '';

    if (normalizedCurrent === normalizedNext) {
      cancelActiveEdit({ focusInput: true, focusEditButton: true });
      return;
    }

    message.content = normalizedNext;
    const timestamp = new Date().toISOString();
    message.timestamp = timestamp;
    conversation.updatedAt = timestamp;
    bumpConversation(conversation.id);

    if (messageElement instanceof HTMLElement) {
      if (body instanceof HTMLElement) {
        body.textContent = normalizedNext;
        body.classList.remove('pending');
      }
      if (messageElement.dataset) {
        messageElement.dataset.contentRaw = normalizedNext;
      }
      const timeElement = messageElement.querySelector('time');
      if (timeElement) {
        timeElement.dateTime = timestamp;
        timeElement.textContent = new Date(timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }

    const title = generateConversationTitle(normalizedNext);
    if (title) {
      conversation.title = title;
    }

    commitBranchTransition(conversation, messageId, previousMessages, previousSelections);
    syncActiveBranchSnapshots(conversation);
    saveConversationsToStorage();
    renderConversationList();
    refreshConversationBranchNavigation(conversation);

    cleanupActiveEditor();
    resetChatEditingUi();

    if (userInput instanceof HTMLElement) {
      userInput.focus();
    }
  };

  return {
    isEditing,
    cancelActiveEdit,
    enterEditModeForMessage,
    applyActiveEdit,
  };
}
