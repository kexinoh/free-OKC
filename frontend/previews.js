import {
  modelLogList,
  modelLogEmpty,
  modelLogTemplate,
  webPreviewFrame,
  webPreviewEmpty,
  openWebPreviewButton,
  pptPreviewContainer,
  pptPreviewEmpty,
  togglePptModeButton,
  pptSlideTemplate,
} from './elements.js';

const modelLogs = [];
let currentWebPreview = null;
let currentPptSlides = [];
let isCarouselMode = false;

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
  currentWebPreview = normalizeWebPreview(preview);

  const hasHtml = typeof currentWebPreview?.html === 'string' && currentWebPreview.html.trim().length > 0;
  const hasUrl = typeof currentWebPreview?.url === 'string' && currentWebPreview.url.trim().length > 0;

  if (webPreviewFrame instanceof HTMLIFrameElement) {
    if (hasHtml) {
      webPreviewFrame.removeAttribute('src');
      webPreviewFrame.srcdoc = currentWebPreview.html;
    } else if (hasUrl) {
      webPreviewFrame.removeAttribute('srcdoc');
      webPreviewFrame.src = currentWebPreview.url;
    } else {
      webPreviewFrame.removeAttribute('src');
      webPreviewFrame.removeAttribute('srcdoc');
      webPreviewFrame.srcdoc = '';
    }
    webPreviewFrame.hidden = !(hasHtml || hasUrl);
  }

  if (webPreviewEmpty instanceof HTMLElement) {
    webPreviewEmpty.hidden = hasHtml || hasUrl;
  }

  if (openWebPreviewButton instanceof HTMLButtonElement) {
    openWebPreviewButton.disabled = !(hasHtml || hasUrl);
  }
}

export function updatePptPreview(slides) {
  currentPptSlides = Array.isArray(slides) ? slides : [];
  pptPreviewContainer.innerHTML = '';

  if (currentPptSlides.length === 0) {
    pptPreviewEmpty.hidden = false;
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
