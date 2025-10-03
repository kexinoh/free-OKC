const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const userInput = document.getElementById('user-input');
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

function addMessage(role, text, options = {}) {
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
  if (typeof text === 'string' && text.length > 0) {
    body.textContent = text;
  } else {
    body.textContent = '';
  }

  if (pending) {
    message.dataset.pending = 'true';
    message.classList.add('pending');
    body.classList.add('pending');
    if (!body.textContent) {
      body.textContent = '正在生成回复…';
    }
  }

  message.append(header, body);
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return message;
}

function finalizePendingMessage(message, text) {
  if (!(message instanceof HTMLElement)) {
    addMessage('assistant', text);
    return;
  }

  const body = message.querySelector('p');
  if (body) {
    body.textContent = typeof text === 'string' ? text : '';
    body.classList.remove('pending');
  }

  message.classList.remove('pending');
  if (message.dataset) {
    delete message.dataset.pending;
  }
  message.removeAttribute('data-pending');
}

function logModelInvocation(meta) {
  if (!meta) return;
  modelLogs.push(meta);
  const limit = 6;
  if (modelLogs.length > limit) {
    modelLogs.splice(0, modelLogs.length - limit);
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
  if (modelLogs.length > 0) {
    modelLogList.scrollTop = modelLogList.scrollHeight;
  }
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
  chatForm.querySelector('button').disabled = true;
  userInput.disabled = true;
  const pendingMessage = addMessage('assistant', '正在生成回复…', { pending: true });
  try {
    const data = await fetchJson('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    finalizePendingMessage(pendingMessage, data.reply);
    logModelInvocation(data.meta);
    updateWebPreview(data.web_preview);
    updatePptPreview(data.ppt_slides);
  } catch (error) {
    console.error(error);
    finalizePendingMessage(pendingMessage, `抱歉，发生错误：${error.message}`);
  } finally {
    setStatus('待命中…');
    chatForm.querySelector('button').disabled = false;
    userInput.disabled = false;
    userInput.value = '';
    userInput.focus();
  }
}

function handleUserSubmit(event) {
  event.preventDefault();
  const value = userInput.value.trim();
  if (!value) return;
  addMessage('user', value);
  sendChat(value);
}

chatForm.addEventListener('submit', handleUserSubmit);

document.addEventListener('DOMContentLoaded', () => {
  setStatus('连接工作台…', true);
  loadConfig();
  bootSession();
});
