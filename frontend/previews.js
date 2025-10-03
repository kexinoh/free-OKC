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

export function updateWebPreview(preview) {
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
  if (!currentWebPreview?.html) return;
  const blob = new Blob([currentWebPreview.html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function initializePreviewControls() {
  togglePptModeButton.addEventListener('click', togglePptMode);
  openWebPreviewButton.addEventListener('click', handleOpenPreview);
}

export function resetPreviews() {
  updateWebPreview(null);
  updatePptPreview([]);
}
