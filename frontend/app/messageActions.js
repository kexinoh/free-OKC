const statusTimers = new WeakMap();
const feedbackTimers = new WeakMap();

function resolveLabelText(text) {
  return typeof text === 'string' ? text : '';
}

export function setMessageActionStatus(button, text) {
  if (!(button instanceof HTMLElement)) return;

  const existingTimeoutId = statusTimers.get(button);
  if (typeof existingTimeoutId === 'number') {
    clearTimeout(existingTimeoutId);
    statusTimers.delete(button);
  }

  const message = resolveLabelText(text);
  const labelSpan = button.querySelector('.message-action-label');
  if (labelSpan) {
    labelSpan.textContent = message;
  }

  if (message) {
    button.dataset.statusVisible = 'true';
  } else {
    delete button.dataset.statusVisible;
  }

  const defaultLabel = button.dataset.defaultLabel ?? '';
  button.title = message || defaultLabel;
  button.setAttribute('aria-label', message || defaultLabel);
}

export function clearMessageActionStatus(button) {
  if (!(button instanceof HTMLElement)) return;

  const timeoutId = statusTimers.get(button);
  if (typeof timeoutId === 'number') {
    clearTimeout(timeoutId);
  }
  statusTimers.delete(button);
  setMessageActionStatus(button, '');
}

export function flashMessageActionStatus(button, text, duration = 1200) {
  if (!(button instanceof HTMLElement)) return;

  const timeoutId = statusTimers.get(button);
  if (typeof timeoutId === 'number') {
    clearTimeout(timeoutId);
  }

  setMessageActionStatus(button, text);

  if (duration > 0) {
    const newTimeoutId = window.setTimeout(() => {
      statusTimers.delete(button);
      setMessageActionStatus(button, '');
    }, duration);
    statusTimers.set(button, newTimeoutId);
  }
}

export function setMessageActionFeedback(button, { status, message, duration = 1200 } = {}) {
  if (!(button instanceof HTMLElement)) return;

  const existingTimer = feedbackTimers.get(button);
  if (typeof existingTimer === 'number') {
    clearTimeout(existingTimer);
    feedbackTimers.delete(button);
  }

  if (typeof message === 'string') {
    flashMessageActionStatus(button, message, duration);
  }

  if (typeof status === 'string' && status.length > 0) {
    button.dataset.feedback = status;
    if (duration > 0) {
      const timeoutId = window.setTimeout(() => {
        delete button.dataset.feedback;
        feedbackTimers.delete(button);
      }, duration);
      feedbackTimers.set(button, timeoutId);
    }
  } else {
    delete button.dataset.feedback;
  }
}

export function setMessageActionsDisabled(messageElement, disabled) {
  if (!(messageElement instanceof HTMLElement)) return;

  const buttons = messageElement.querySelectorAll('button.message-action');
  buttons.forEach((button) => {
    button.disabled = disabled;
    if (disabled) {
      clearMessageActionStatus(button);
    }
  });
}
