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

const HTML_PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';
const EMPTY_PREVIEW_SANDBOX = 'allow-popups';
let previewSandboxMode = null;

const modelLogs = [];
let currentWebPreview = null;
let currentPptSlides = [];
let isCarouselMode = false;
const defaultWebPreviewEmptyMessage = webPreviewEmpty?.textContent ?? '';

export function logModelInvocation(meta) {
  if (!meta || !modelLogList) return;
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

export function resetModelLogs() {
  modelLogs.length = 0;
  if (modelLogList) {
    modelLogList.innerHTML = '';
  }
  if (modelLogEmpty) {
    modelLogEmpty.hidden = false;
  }
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
      webPreviewFrame.srcdoc = '';
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
  } else if (hasUrl) {
    if (webPreviewFrame) {
      applyPreviewSandbox('url');
      webPreviewFrame.srcdoc = '';
      webPreviewFrame.src = normalizedPreview.url;
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
