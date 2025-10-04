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
  setMessageActionsDisabled,
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

  const restoreLegacyFormState = () => {
    if (chatForm) {
      chatForm.classList.remove('editing');
      delete chatForm.dataset.editing;
    }
    if (sendButton) {
      sendButton.textContent = defaultSendButtonLabel;
      sendButton.disabled = false;
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
      userInput.placeholder = defaultInputPlaceholder;
      userInput.disabled = false;
    }
  };

  restoreLegacyFormState();

  const teardownInlineEditor = ({ focusInput = false, restoreFocus } = {}) => {
    if (!activeEditState) {
      restoreLegacyFormState();
      if (restoreFocus instanceof HTMLElement) {
        restoreFocus.focus();
      } else if (focusInput) {
        focusInputEnd();
      }
      return;
    }

    const {
      messageElement,
      editorForm,
      messageBody,
      messageFooter,
      bodyWasHidden,
      footerWasHidden,
      triggerButton,
    } = activeEditState;

    if (messageBody instanceof HTMLElement) {
      messageBody.hidden = bodyWasHidden;
    }
    if (messageFooter instanceof HTMLElement) {
      messageFooter.hidden = footerWasHidden;
    }

    if (editorForm instanceof HTMLElement && editorForm.isConnected) {
      editorForm.remove();
    }

    if (messageElement instanceof HTMLElement) {
      messageElement.classList.remove('editing');
      if (messageElement.dataset) {
        delete messageElement.dataset.editing;
      }
    }

    if (typeof setMessageActionsDisabled === 'function' && messageElement instanceof HTMLElement) {
      setMessageActionsDisabled(messageElement, false);
    }

    const shouldRestoreTrigger =
      !focusInput &&
      triggerButton instanceof HTMLElement &&
      typeof document !== 'undefined' &&
      document.contains(triggerButton);

    activeEditState = null;

    restoreLegacyFormState();

    if (focusInput) {
      focusInputEnd();
    } else if (restoreFocus instanceof HTMLElement) {
      restoreFocus.focus();
    } else if (shouldRestoreTrigger) {
      triggerButton.focus();
    }
  };

  const isEditing = () => activeEditState !== null;

  function cancelActiveEdit(options = {}) {
    teardownInlineEditor(options);
  }

  function applyActiveEdit(nextContentRaw) {
    if (!isEditing()) {
      return;
    }

    const {
      conversationId,
      messageId,
      previousMessages,
      previousSelections,
      messageElement,
      messageBody,
      textarea,
    } = activeEditState;

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
    const nextValueRaw =
      typeof nextContentRaw === 'string'
        ? nextContentRaw
        : textarea instanceof HTMLTextAreaElement
          ? textarea.value
          : null;

    if (typeof nextValueRaw !== 'string') {
      cancelActiveEdit({ focusInput: true });
      return;
    }

    const normalizedNext = nextValueRaw.replace(/\r\n/g, '\n');

    if (normalizedCurrent === normalizedNext) {
      cancelActiveEdit({ focusInput: true });
      return;
    }

    message.content = normalizedNext;
    const timestamp = new Date().toISOString();
    message.timestamp = timestamp;
    conversation.updatedAt = timestamp;
    bumpConversation(conversation.id);

    const targetElement =
      messageElement instanceof HTMLElement
        ? messageElement
        : typeof findMessageElementById === 'function'
          ? findMessageElementById(messageId)
          : null;

    if (targetElement instanceof HTMLElement) {
      if (targetElement.dataset) {
        targetElement.dataset.contentRaw = normalizedNext;
      }
      const bodyNode =
        messageBody instanceof HTMLElement ? messageBody : targetElement.querySelector('.message-content');
      if (bodyNode) {
        bodyNode.textContent = normalizedNext;
        bodyNode.classList.remove('pending');
        bodyNode.hidden = false;
      }
      const timeElement = targetElement.querySelector('time');
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
  }

  const enterEditModeForMessage = ({
    conversation,
    message,
    initialValue,
    previousMessages,
    previousSelections,
    messageElement,
    triggerButton,
  }) => {
    if (!conversation || !message) {
      return;
    }

    const targetMessageElement =
      messageElement instanceof HTMLElement
        ? messageElement
        : typeof findMessageElementById === 'function'
          ? findMessageElementById(message.id)
          : null;

    if (!(targetMessageElement instanceof HTMLElement)) {
      return;
    }

    cancelActiveEdit({ focusInput: false });

    const contentNode = targetMessageElement.querySelector('.message-content');
    const footerNode = targetMessageElement.querySelector('.message-footer');

    const editorForm = document.createElement('form');
    editorForm.className = 'message-edit-form';
    editorForm.noValidate = true;

    const textarea = document.createElement('textarea');
    textarea.className = 'message-edit-textarea';
    textarea.name = 'message-edit';
    textarea.setAttribute('aria-label', '编辑消息内容');
    textarea.autocomplete = 'off';
    textarea.spellcheck = true;
    textarea.value = typeof initialValue === 'string' ? initialValue : '';
    const lineCount = textarea.value.split('\n').length;
    textarea.rows = Math.min(Math.max(lineCount, 3), 12);
    editorForm.appendChild(textarea);

    const actions = document.createElement('div');
    actions.className = 'message-edit-actions';

    const cancelButtonInline = document.createElement('button');
    cancelButtonInline.type = 'button';
    cancelButtonInline.className = 'ghost-button message-edit-cancel';
    cancelButtonInline.textContent = '取消';
    cancelButtonInline.addEventListener('click', () => {
      cancelActiveEdit({ focusInput: true });
    });

    const saveButtonInline = document.createElement('button');
    saveButtonInline.type = 'submit';
    saveButtonInline.className = 'primary-button message-edit-save';
    saveButtonInline.textContent = '保存';

    actions.append(cancelButtonInline, saveButtonInline);
    editorForm.appendChild(actions);

    editorForm.addEventListener('submit', (event) => {
      event.preventDefault();
      applyActiveEdit(textarea.value);
    });

    textarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        applyActiveEdit(textarea.value);
      }
    });

    const bodyWasHidden = contentNode?.hidden ?? false;
    if (contentNode instanceof HTMLElement) {
      contentNode.hidden = true;
    }

    const footerWasHidden = footerNode?.hidden ?? false;
    if (footerNode instanceof HTMLElement) {
      footerNode.hidden = true;
      footerNode.before(editorForm);
    } else {
      targetMessageElement.appendChild(editorForm);
    }

    targetMessageElement.classList.add('editing');
    if (targetMessageElement.dataset) {
      targetMessageElement.dataset.editing = 'true';
    }

    if (typeof setMessageActionsDisabled === 'function') {
      setMessageActionsDisabled(targetMessageElement, true);
    }

    activeEditState = {
      conversationId: conversation.id,
      messageId: message.id,
      previousMessages,
      previousSelections,
      messageElement: targetMessageElement,
      messageBody: contentNode instanceof HTMLElement ? contentNode : null,
      messageFooter: footerNode instanceof HTMLElement ? footerNode : null,
      bodyWasHidden,
      footerWasHidden,
      editorForm,
      textarea,
      triggerButton: triggerButton instanceof HTMLElement ? triggerButton : null,
    };

    try {
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    } catch (error) {
      textarea.focus();
    }
  };

  return {
    isEditing,
    cancelActiveEdit,
    enterEditModeForMessage,
    applyActiveEdit,
  };
}
