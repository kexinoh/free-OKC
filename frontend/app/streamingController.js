import { streamJson } from '../utils.js';

function setupStreamingUI(messageElement) {
  if (!(messageElement instanceof HTMLElement)) {
    return { textElement: null, toolContainer: null, statusElement: null };
  }

  const body = messageElement.querySelector('.message-content');
  if (!(body instanceof HTMLElement)) {
    return { textElement: null, toolContainer: null, statusElement: null };
  }

  body.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'streaming-content';

  const textElement = document.createElement('div');
  textElement.className = 'streaming-text';
  wrapper.appendChild(textElement);

  const reasoningWrapper = document.createElement('div');
  reasoningWrapper.className = 'reasoning-wrapper';

  const statusElement = document.createElement('div');
  statusElement.className = 'reasoning-header';
  statusElement.textContent = '推理中';
  reasoningWrapper.appendChild(statusElement);

  const toolContainer = document.createElement('div');
  toolContainer.className = 'tool-status-container';
  reasoningWrapper.appendChild(toolContainer);

  wrapper.appendChild(reasoningWrapper);

  body.appendChild(wrapper);
  return { textElement, toolContainer, statusElement };
}

function formatToolDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return '';
  }
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }
  return `${Math.round(durationMs)}ms`;
}

function renderToolEvent(toolContainer, registry, event) {
  if (!(toolContainer instanceof HTMLElement) || !event) return;

  const invocationId = event.invocation_id?.trim() || null;
  if (!invocationId) return;

  const existing = registry.get(invocationId);
  if (event.type === 'tool_started') {
    const card = document.createElement('div');
    card.className = 'tool-status-card';
    card.dataset.invocationId = invocationId;

    const header = document.createElement('div');
    header.className = 'tool-status-header';

    const title = document.createElement('strong');
    title.textContent = event.tool_name?.trim() || '工具执行中';
    header.appendChild(title);

    const status = document.createElement('span');
    status.className = 'tool-status-indicator';
    status.textContent = '执行中…';
    header.appendChild(status);

    const body = document.createElement('div');
    body.className = 'tool-status-body';

    if (event.input !== undefined && event.input !== null) {
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(event.input, null, 2);
      body.appendChild(pre);
    }

    card.append(header, body);
    registry.set(invocationId, { card, status, body, startedAt: Date.now() });
    toolContainer.appendChild(card);
    return;
  }

  if (!existing) return;

  if (event.type === 'tool_completed') {
    const { card, status, body, startedAt } = existing;
    const isError = event.status === 'error';
    status.textContent = isError ? '执行失败' : '已完成';
    card.dataset.status = isError ? 'error' : 'done';
    card.classList.toggle('error', isError);
    card.classList.toggle('completed', !isError);
    const duration = formatToolDuration(Date.now() - (startedAt ?? Date.now()));
    if (duration) {
      status.textContent += ` · ${duration}`;
    }

    if (isError) {
      const errorMessage = (typeof event.error === 'string' && event.error.trim()) || '工具执行失败';
      const errorParagraph = document.createElement('p');
      errorParagraph.className = 'tool-status-error';
      errorParagraph.textContent = errorMessage;
      body.appendChild(errorParagraph);
    } else if (event.output !== undefined) {
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(event.output, null, 2);
      body.appendChild(pre);
    }
    registry.delete(invocationId);
    return;
  }
}

export function createStreamingController({ finalizePendingMessage }) {
  const runAssistantStream = async (messageElement, messageId, requestBody, { onSuccess } = {}) => {
    let textElement = null;
    let toolContainer = null;
    let statusElement = null;

    if (messageElement instanceof HTMLElement) {
      const setup = setupStreamingUI(messageElement);
      textElement = setup.textElement;
      toolContainer = setup.toolContainer;
      statusElement = setup.statusElement;
    }

    const toolRegistry = new Map();
    let currentText = '';

    const handleEvent = (event) => {
      if (!event || typeof event !== 'object') return;
      if (event.type === 'token') {
        const delta = typeof event.delta === 'string' ? event.delta : '';
        if (!delta) return;
        currentText += delta;
        if (textElement instanceof HTMLElement) {
          textElement.textContent = currentText;
        }
        if (messageElement?.dataset) {
          messageElement.dataset.contentRaw = currentText;
        }
        return;
      }

      if (event.type === 'tool_started' || event.type === 'tool_completed') {
        renderToolEvent(toolContainer, toolRegistry, event);
      }
    };

    const payload = await streamJson(
      '/api/chat',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: true, ...requestBody }),
      },
      handleEvent,
    );

    if (!payload || typeof payload.reply !== 'string') {
      throw new Error('模型返回为空');
    }

    finalizePendingMessage(messageElement, payload.reply, messageId, {
      reasoning:
        toolContainer instanceof HTMLElement
          ? { toolContainer, statusElement: statusElement ?? null }
          : null,
    });
    if (typeof onSuccess === 'function') {
      onSuccess(payload);
    }
    return payload;
  };

  return {
    runAssistantStream,
  };
}
