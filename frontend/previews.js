import {
  modelLogList,
  modelLogEmpty,
  modelLogTemplate,
  webPreviewCard,
  webPreviewFrame,
  webPreviewEmpty,
  openWebPreviewButton,
  pptPreviewCard,
  pptPreviewContainer,
  pptPreviewEmpty,
  togglePptModeButton,
  pptSlideTemplate,
} from './elements.js';

const HTML_PREVIEW_SANDBOX =
  'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin';
const EMPTY_PREVIEW_SANDBOX = 'allow-popups';
let previewSandboxMode = null;

const MODEL_LOG_LIMIT = 6;
const modelLogs = [];
let currentWebPreview = null;
let currentPptSlides = [];
let isCarouselMode = false;
const defaultWebPreviewEmptyMessage = webPreviewEmpty?.textContent ?? '';

function normalizeModelLog(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const toString = (value) => {
    if (typeof value === 'string') return value;
    if (value === null || value === undefined) return '';
    try {
      return String(value);
    } catch (error) {
      return '';
    }
  };

  const normalized = {
    model: toString(meta.model).trim(),
    timestamp: toString(meta.timestamp).trim(),
    summary: toString(meta.summary).trim(),
    tokensIn: toString(meta.tokensIn).trim(),
    tokensOut: toString(meta.tokensOut).trim(),
    latency: toString(meta.latency).trim(),
  };

  const hasContent = normalized.model || normalized.summary || normalized.timestamp;
  return hasContent ? normalized : null;
}

function renderModelLogs() {
  if (modelLogList) {
    modelLogList.innerHTML = '';
    modelLogs.forEach((log) => {
      if (modelLogTemplate instanceof HTMLTemplateElement) {
        const clone = modelLogTemplate.content.cloneNode(true);
        const name = clone.querySelector?.('.model-name');
        const time = clone.querySelector?.('.model-time');
        const summary = clone.querySelector?.('.model-summary');
        const tokensIn = clone.querySelector?.('.meta-input');
        const tokensOut = clone.querySelector?.('.meta-output');
        const latency = clone.querySelector?.('.meta-latency');
        if (name) name.textContent = log.model;
        if (time) time.textContent = log.timestamp;
        if (summary) summary.textContent = log.summary;
        if (tokensIn) tokensIn.textContent = log.tokensIn;
        if (tokensOut) tokensOut.textContent = log.tokensOut;
        if (latency) latency.textContent = log.latency;
        modelLogList.appendChild(clone);
      } else if (modelLogList instanceof HTMLElement) {
        const item = document.createElement('li');
        item.textContent = [log.timestamp, log.model, log.summary].filter(Boolean).join(' · ');
        modelLogList.appendChild(item);
      }
    });
    if (modelLogs.length > 0) {
      modelLogList.scrollTop = modelLogList.scrollHeight;
    }
  }
  if (modelLogEmpty) {
    modelLogEmpty.hidden = modelLogs.length > 0;
  }
}

export function logModelInvocation(meta) {
  const normalized = normalizeModelLog(meta);
  if (!normalized) return;
  modelLogs.push(normalized);
  if (modelLogs.length > MODEL_LOG_LIMIT) {
    modelLogs.splice(0, modelLogs.length - MODEL_LOG_LIMIT);
  }
  renderModelLogs();
}

export function restoreModelLogs(logs) {
  modelLogs.length = 0;
  if (Array.isArray(logs)) {
    logs.forEach((entry) => {
      const normalized = normalizeModelLog(entry);
      if (normalized) {
        modelLogs.push(normalized);
      }
    });
  }
  if (modelLogs.length > MODEL_LOG_LIMIT) {
    modelLogs.splice(0, modelLogs.length - MODEL_LOG_LIMIT);
  }
  renderModelLogs();
}

export function resetModelLogs() {
  restoreModelLogs([]);
}

function applyPreviewSandbox(mode) {
  if (!webPreviewFrame) return;

  if (previewSandboxMode === mode) {
    return;
  }

  switch (mode) {
    case 'html':
      webPreviewFrame.setAttribute('sandbox', HTML_PREVIEW_SANDBOX);
      break;
    case 'url':
      webPreviewFrame.removeAttribute('sandbox');
      break;
    default:
      webPreviewFrame.setAttribute('sandbox', EMPTY_PREVIEW_SANDBOX);
      break;
  }

  previewSandboxMode = mode;
}

applyPreviewSandbox('empty');

function normalizeWebPreview(preview) {
  if (!preview || typeof preview !== 'object') {
    return null;
  }

  const normalized = {};
  const htmlCandidate =
    typeof preview.html === 'string'
      ? preview.html
      : typeof preview.content === 'string'
        ? preview.content
        : null;
  if (htmlCandidate && htmlCandidate.trim()) {
    normalized.html = htmlCandidate;
  }

  const urlCandidate =
    typeof preview.url === 'string'
      ? preview.url
      : typeof preview.preview_url === 'string'
        ? preview.preview_url
        : typeof preview.server_preview_url === 'string'
          ? preview.server_preview_url
          : null;
  if (urlCandidate && urlCandidate.trim()) {
    normalized.url = urlCandidate;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function updateWebPreview(preview) {
  const normalizedPreview = normalizeWebPreview(preview);
  currentWebPreview = normalizedPreview;

  const hasHtml = Boolean(normalizedPreview?.html);
  const hasUrl = Boolean(normalizedPreview?.url);
  const hasContent = hasHtml || hasUrl;

  if (webPreviewCard) {
    webPreviewCard.hidden = !hasContent;
  }

  if (!hasContent) {
    if (webPreviewFrame) {
      webPreviewFrame.removeAttribute('src');
      applyPreviewSandbox('empty');
      webPreviewFrame.srcdoc = '';
      webPreviewFrame.src = 'about:blank';
      webPreviewFrame.hidden = true;
    }
    if (webPreviewEmpty) {
      webPreviewEmpty.hidden = true;
      webPreviewEmpty.textContent = defaultWebPreviewEmptyMessage;
    }
    if (openWebPreviewButton) {
      openWebPreviewButton.disabled = true;
    }
    return;
  }

  if (webPreviewFrame) {
    webPreviewFrame.hidden = true;
    webPreviewFrame.removeAttribute('src');
    webPreviewFrame.removeAttribute('srcdoc');
  }

  if (hasUrl) {
    if (webPreviewFrame) {
      applyPreviewSandbox('url');
      webPreviewFrame.src = normalizedPreview.url;
      webPreviewFrame.hidden = false;
    }
    if (webPreviewEmpty) {
      webPreviewEmpty.hidden = true;
      webPreviewEmpty.textContent = defaultWebPreviewEmptyMessage;
    }
  } else if (hasHtml) {
    if (webPreviewFrame) {
      applyPreviewSandbox('html');
      webPreviewFrame.src = 'about:blank';
      webPreviewFrame.srcdoc = normalizedPreview.html;
      webPreviewFrame.hidden = false;
    }
    if (webPreviewEmpty) {
      webPreviewEmpty.hidden = true;
      webPreviewEmpty.textContent = defaultWebPreviewEmptyMessage;
    }
  } else {
    if (webPreviewFrame) {
      applyPreviewSandbox('empty');
      webPreviewFrame.srcdoc = '';
      webPreviewFrame.src = 'about:blank';
      webPreviewFrame.hidden = true;
    }
    if (webPreviewEmpty) {
      webPreviewEmpty.hidden = false;
      webPreviewEmpty.textContent = '点击“新窗口打开”在新标签页查看网页。';
    }
  }

  if (openWebPreviewButton) {
    openWebPreviewButton.disabled = false;
  }
}


export function updatePptPreview(slides) {
  currentPptSlides = Array.isArray(slides) ? slides : [];
  pptPreviewContainer.innerHTML = '';

  const hasSlides = currentPptSlides.length > 0;

  if (pptPreviewCard) {
    pptPreviewCard.hidden = !hasSlides;
  }

  if (!hasSlides) {
    pptPreviewEmpty.hidden = true;
    pptPreviewContainer.hidden = true;
    togglePptModeButton.disabled = true;
    if (isCarouselMode) {
      isCarouselMode = false;
      pptPreviewContainer.classList.remove('carousel');
    }
    togglePptModeButton.textContent = '幻灯模式';
    return;
  }

  pptPreviewEmpty.hidden = true;
  pptPreviewContainer.hidden = false;
  togglePptModeButton.disabled = false;
  togglePptModeButton.textContent = isCarouselMode ? '堆叠模式' : '幻灯模式';

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

function handleOpenPreview() {
  if (!currentWebPreview) return;

  if (typeof currentWebPreview.url === 'string' && currentWebPreview.url.trim()) {
    const newWindow = window.open(currentWebPreview.url, '_blank');
    if (newWindow) {
      newWindow.opener = null;
    }
    return;
  }

  if (typeof currentWebPreview.html === 'string' && currentWebPreview.html.trim()) {
    const blob = new Blob([currentWebPreview.html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, '_blank');
    if (newWindow) {
      newWindow.opener = null;
    }
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function initializePreviewControls() {
  if (togglePptModeButton instanceof HTMLElement) {
    togglePptModeButton.addEventListener('click', togglePptMode);
  }
  if (openWebPreviewButton instanceof HTMLElement) {
    openWebPreviewButton.addEventListener('click', handleOpenPreview);
  }
}

export function resetPreviews() {
  updateWebPreview(null);
  updatePptPreview([]);
}
