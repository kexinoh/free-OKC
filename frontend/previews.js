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

    const toolList = clone.querySelector('.tool-call-list');
    if (toolList) {
      toolList.innerHTML = '';
      const toolCalls = Array.isArray(log.toolCalls)
        ? log.toolCalls.filter((item) => item && typeof item === 'object')
        : [];
      if (toolCalls.length > 0) {
        toolList.hidden = false;
        toolCalls.forEach((call) => {
          const details = document.createElement('details');
          details.className = 'tool-call-entry';

          const summary = document.createElement('summary');
          summary.className = 'tool-call-summary';
          const name = typeof call.name === 'string' && call.name.trim() ? call.name.trim() : '工具调用';
          summary.innerHTML = `<span class="tool-call-name">🔧 ${name}</span>`;
          if (typeof call.source === 'string' && call.source.trim()) {
            const source = document.createElement('span');
            source.className = 'tool-call-source';
            source.textContent = call.source.trim();
            summary.appendChild(source);
          }
          details.appendChild(summary);

          const content = document.createElement('div');
          content.className = 'tool-call-content';

          if (typeof call.arguments === 'string' && call.arguments.trim()) {
            const argsBlock = document.createElement('div');
            argsBlock.className = 'tool-call-block';
            const argsLabel = document.createElement('span');
            argsLabel.className = 'tool-call-label';
            argsLabel.textContent = '输入参数';
            const argsValue = document.createElement('code');
            argsValue.className = 'tool-call-value';
            argsValue.textContent = call.arguments.trim();
            argsBlock.append(argsLabel, argsValue);
            content.appendChild(argsBlock);
          }

          if (typeof call.output === 'string' && call.output.trim()) {
            const outputBlock = document.createElement('div');
            outputBlock.className = 'tool-call-block';
            const outputLabel = document.createElement('span');
            outputLabel.className = 'tool-call-label';
            outputLabel.textContent = '执行结果';
            const outputValue = document.createElement('code');
            outputValue.className = 'tool-call-value';
            outputValue.textContent = call.output.trim();
            outputBlock.append(outputLabel, outputValue);
            content.appendChild(outputBlock);
          }

          if (!content.childNodes.length) {
            const empty = document.createElement('p');
            empty.className = 'tool-call-empty';
            empty.textContent = '该工具调用未返回额外信息。';
            content.appendChild(empty);
          }

          details.appendChild(content);
          toolList.appendChild(details);
        });
      } else {
        toolList.hidden = true;
      }
    }

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
