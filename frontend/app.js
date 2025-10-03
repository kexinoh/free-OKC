const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
const sendButton = chatForm?.querySelector('.send-button') ?? null;
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
const quickPromptButtons = Array.from(document.querySelectorAll('[data-quick-prompt]'));
const charCountLabel = document.getElementById('char-count');

let previousFocusedElement = null;

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

function updateCharCount() {
  if (!charCountLabel || !(userInput instanceof HTMLTextAreaElement)) return;
  charCountLabel.textContent = String(userInput.value.length);
}

function autoResizeTextarea() {
  if (!(userInput instanceof HTMLTextAreaElement)) return;
  userInput.style.height = 'auto';
  const minHeight = 112;
  const maxHeight = 280;
  const nextHeight = Math.min(Math.max(userInput.scrollHeight, minHeight), maxHeight);
  userInput.style.height = `${nextHeight}px`;
}

function setQuickPromptsDisabled(disabled) {
  quickPromptButtons.forEach((button) => {
    button.disabled = disabled;
  });
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
  if (event.key === 'Escape' && !settingsOverlay?.hidden) {
    event.preventDefault();
    closeSettingsPanel();
  }
});

quickPromptButtons.forEach((button) => {
  button.addEventListener('click', (event) => {
    if (!(event.currentTarget instanceof HTMLButtonElement)) return;
    const prompt = event.currentTarget.dataset.quickPrompt;
    if (!prompt || !userInput) return;
    userInput.value = prompt;
    autoResizeTextarea();
    updateCharCount();
    userInput.focus();
  });
});

if (userInput) {
  userInput.addEventListener('input', () => {
    autoResizeTextarea();
    updateCharCount();
  });
}

function addMessage(role, text) {
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
  body.textContent = text;

  message.append(header, body);
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function logModelInvocation(meta) {
  if (!meta) return;
  modelLogs.unshift(meta);
  const limit = 6;
  if (modelLogs.length > limit) {
    modelLogs.length = limit;
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
    return;
  }

  pptPreviewEmpty.hidden = true;
  pptPreviewContainer.hidden = false;
  togglePptModeButton.disabled = false;

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
    addMessage('assistant', data.reply);
    logModelInvocation(data.meta);
    updateWebPreview(data.web_preview);
    updatePptPreview(data.ppt_slides);
  } catch (error) {
    console.error(error);
    addMessage('assistant', '无法连接到后端服务，请确认已启动。');
  } finally {
    setStatus('待命中…');
  }
}

async function sendChat(message) {
  setStatus('创意生成中…', true);
  if (sendButton instanceof HTMLButtonElement) {
    sendButton.disabled = true;
  }
  if (userInput instanceof HTMLTextAreaElement) {
    userInput.disabled = true;
  }
  setQuickPromptsDisabled(true);
  try {
    const data = await fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    addMessage('assistant', data.reply);
    logModelInvocation(data.meta);
    updateWebPreview(data.web_preview);
    updatePptPreview(data.ppt_slides);
  } catch (error) {
    console.error(error);
    addMessage('assistant', `抱歉，发生错误：${error.message}`);
  } finally {
    setStatus('待命中…');
    if (sendButton instanceof HTMLButtonElement) {
      sendButton.disabled = false;
    }
    if (userInput instanceof HTMLTextAreaElement) {
      userInput.disabled = false;
      userInput.value = '';
      autoResizeTextarea();
      updateCharCount();
      userInput.focus();
    }
    setQuickPromptsDisabled(false);
  }
}

function handleUserSubmit(event) {
  event.preventDefault();
  if (!(userInput instanceof HTMLTextAreaElement)) return;
  const value = userInput.value.trim();
  if (!value) return;
  addMessage('user', value);
  sendChat(value);
}

if (chatForm) {
  chatForm.addEventListener('submit', handleUserSubmit);
}

document.addEventListener('DOMContentLoaded', () => {
  setStatus('连接工作台…', true);
  loadConfig();
  bootSession();
  autoResizeTextarea();
  updateCharCount();
});
