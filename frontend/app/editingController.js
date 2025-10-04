export function createEditingController({
  chatForm,
  userInput,
  sendButton,
  cancelEditButton,
  chatEditingHint,
  defaultSendButtonLabel,
  defaultInputPlaceholder,
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
}) {
  let activeEditState = null;

  const focusInputEnd = () => {
    if (!userInput) return;
    try {
      const length = userInput.value.length;
      userInput.focus();
      userInput.setSelectionRange(length, length);
    } catch (error) {
      userInput.focus();
    }
  };

  const resetEditingUi = ({ focusInput = false, clearInput = true } = {}) => {
    activeEditState = null;

    if (chatForm) {
      chatForm.classList.remove('editing');
      delete chatForm.dataset.editing;
    }

    if (sendButton) {
      sendButton.textContent = defaultSendButtonLabel;
    }

    if (cancelEditButton) {
      cancelEditButton.hidden = true;
      cancelEditButton.disabled = false;
    }

    if (chatEditingHint) {
      chatEditingHint.hidden = true;
      if (defaultEditingHintText) {
        chatEditingHint.textContent = defaultEditingHintText;
      }
    }

    if (userInput) {
      if (clearInput) {
        userInput.value = '';
      }
      userInput.placeholder = defaultInputPlaceholder;
      if (focusInput) {
        focusInputEnd();
      }
    }
  };

  const isEditing = () => activeEditState !== null;

  const cancelActiveEdit = (options = {}) => {
    resetEditingUi(options);
  };

  const enterEditModeForMessage = ({
    conversation,
    message,
    initialValue,
    previousMessages,
    previousSelections,
  }) => {
    if (!conversation || !message || !chatForm || !userInput) {
      return;
    }

    activeEditState = {
      conversationId: conversation.id,
      messageId: message.id,
      previousMessages,
      previousSelections,
    };

    chatForm.dataset.editing = 'true';
    chatForm.classList.add('editing');

    if (sendButton) {
      sendButton.textContent = '保存';
    }

    if (cancelEditButton) {
      cancelEditButton.hidden = false;
      cancelEditButton.disabled = false;
    }

    if (chatEditingHint) {
      if (defaultEditingHintText) {
        chatEditingHint.textContent = defaultEditingHintText;
      }
      chatEditingHint.hidden = false;
    }

    const value = typeof initialValue === 'string' ? initialValue : '';
    userInput.value = value;
    userInput.placeholder = '编辑消息后点击保存';

    focusInputEnd();
  };

  const applyActiveEdit = (nextContentRaw) => {
    if (!isEditing()) {
      return;
    }

    const { conversationId, messageId, previousMessages, previousSelections } = activeEditState;
    const conversation = getConversations().find((entry) => entry.id === conversationId);
    if (!conversation) {
      cancelActiveEdit({ focusInput: false });
      return;
    }

    const messageIndex = conversation.messages.findIndex((entry) => entry.id === messageId);
    if (messageIndex === -1) {
      cancelActiveEdit({ focusInput: false });
      return;
    }

    const message = conversation.messages[messageIndex];
    const normalizedCurrent =
      typeof message.content === 'string' ? message.content.replace(/\r\n/g, '\n') : '';
    const normalizedNext =
      typeof nextContentRaw === 'string' ? nextContentRaw.replace(/\r\n/g, '\n') : '';

    if (normalizedCurrent === normalizedNext) {
      cancelActiveEdit({ focusInput: true });
      return;
    }

    message.content = normalizedNext;
    const timestamp = new Date().toISOString();
    message.timestamp = timestamp;
    conversation.updatedAt = timestamp;
    bumpConversation(conversation.id);

    const messageElement = findMessageElementById(messageId);
    if (messageElement instanceof HTMLElement) {
      const body = messageElement.querySelector('.message-content');
      if (body) {
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

    cancelActiveEdit({ focusInput: true });
  };

  return {
    isEditing,
    cancelActiveEdit,
    enterEditModeForMessage,
    applyActiveEdit,
  };
}
