const overlay = document.getElementById('message-editor-overlay');
const dialog = document.getElementById('message-editor-dialog');
const titleElement = document.getElementById('message-editor-title');
const editorContainer = document.getElementById('message-editor-container');
const cancelButtons = document.querySelectorAll('[data-action="cancel-edit-message"]');
const confirmButtons = document.querySelectorAll('[data-action="confirm-edit-message"]');

let editorInstance = null;
let isOpen = false;
let resolveCallback = null;
let previousFocusedElement = null;

function ensureEditorInstance() {
  if (editorInstance || !editorContainer) {
    return editorInstance;
  }

  const ToastEditor = window.toastui?.Editor;
  if (!ToastEditor) {
    throw new Error('Toast UI Editor library failed to load.');
  }

  editorInstance = new ToastEditor({
    el: editorContainer,
    height: '320px',
    initialEditType: 'markdown',
    previewStyle: 'vertical',
    usageStatistics: false,
    autofocus: false,
    toolbarItems: [
      ['heading', 'bold', 'italic', 'strike'],
      ['quote', 'code', 'codeblock'],
      ['ul', 'ol', 'task'],
      ['link'],
    ],
  });

  return editorInstance;
}

function closeEditor(result = null) {
  if (!isOpen) return;

  isOpen = false;
  overlay?.classList.remove('open');
  if (overlay) {
    overlay.hidden = true;
  }
  document.body?.classList.remove('no-scroll');

  const instance = editorInstance;
  if (instance) {
    instance.blur();
  }

  const resolver = resolveCallback;
  resolveCallback = null;

  if (typeof resolver === 'function') {
    resolver(result);
  }

  const focusTarget = previousFocusedElement instanceof HTMLElement ? previousFocusedElement : null;
  previousFocusedElement = null;
  if (focusTarget) {
    focusTarget.focus();
  }
}

function cancelEditor() {
  if (!isOpen) return;
  closeEditor(null);
}

function handleKeydown(event) {
  if (!isOpen) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    cancelEditor();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'enter') {
    event.preventDefault();
    confirmEditor();
  }
}

function bindOverlayEvents() {
  if (!overlay) return;

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      cancelEditor();
    }
  });
}

function bindButtonEvents() {
  cancelButtons.forEach((button) => {
    button.addEventListener('click', () => cancelEditor());
  });
  confirmButtons.forEach((button) => {
    button.addEventListener('click', () => confirmEditor());
  });
}

export function initializeMessageEditor() {
  if (!overlay || !dialog || !editorContainer) {
    console.warn('Message editor overlay is missing required DOM nodes.');
    return;
  }

  if (overlay.dataset.initialized === 'true') {
    return;
  }

  bindOverlayEvents();
  bindButtonEvents();
  document.addEventListener('keydown', handleKeydown, true);
  overlay.dataset.initialized = 'true';
}

function confirmEditor() {
  if (!isOpen) return;
  try {
    const instance = ensureEditorInstance();
    const value = instance ? instance.getMarkdown() : '';
    closeEditor(value);
  } catch (error) {
    console.error(error);
    cancelEditor();
  }
}

export function isMessageEditorOpen() {
  return isOpen;
}

export function openMessageEditor({ title = '编辑消息', initialValue = '' } = {}) {
  if (!overlay || !dialog) {
    return Promise.resolve(null);
  }

  try {
    ensureEditorInstance();
  } catch (error) {
    console.error(error);
    return Promise.resolve(null);
  }

  previousFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.body?.classList.add('no-scroll');
  overlay.hidden = false;
  overlay.classList.add('open');
  isOpen = true;

  if (titleElement) {
    titleElement.textContent = title;
  }

  const instance = ensureEditorInstance();
  if (instance) {
    instance.setMarkdown(typeof initialValue === 'string' ? initialValue : '');
    setTimeout(() => {
      try {
        instance.focus();
      } catch (error) {
        console.error('Failed to focus message editor', error);
      }
    }, 16);
  }

  return new Promise((resolve) => {
    resolveCallback = resolve;
  });
}

export function closeMessageEditor() {
  cancelEditor();
}
