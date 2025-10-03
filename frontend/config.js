import { SERVICES } from './constants.js';
import { configForm, configStatus } from './elements.js';
import { fetchJson } from './utils.js';

const serviceInputs = SERVICES.reduce((acc, service) => {
  acc[service] = {
    model: document.querySelector(`input[data-service="${service}"][data-field="model"]`),
    base_url: document.querySelector(`input[data-service="${service}"][data-field="base_url"]`),
    api_key: document.querySelector(`input[data-service="${service}"][data-field="api_key"]`),
  };
  return acc;
}, {});

function showConfigStatus(message, variant) {
  if (!configStatus) return;
  configStatus.textContent = message;
  configStatus.classList.remove('success', 'error');
  if (variant) {
    configStatus.classList.add(variant);
  }
}

function populateConfigForm(data) {
  if (!configForm) return;
  SERVICES.forEach((service) => {
    const fields = serviceInputs[service];
    if (!fields) return;
    const entry = data?.[service];
    fields.model.value = entry?.model ?? '';
    fields.base_url.value = entry?.base_url ?? '';
    fields.api_key.value = '';
    fields.api_key.placeholder = entry?.api_key_present ? '已保存，更新请重新输入' : '••••••';
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

async function handleConfigSubmit(event) {
  event.preventDefault();
  if (!configForm) return;
  const submitButton = configForm.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
  }
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
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

export async function loadConfig() {
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

export function initializeConfigForm() {
  if (!configForm) return;
  configForm.addEventListener('submit', handleConfigSubmit);
}
