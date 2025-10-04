function resolveChatPanel(chatPanel, chatMessages) {
  if (chatPanel instanceof HTMLElement) {
    return chatPanel;
  }
  return chatMessages?.closest?.('.chat-panel') ?? null;
}

export function createHistoryLayoutManager({ historySidebar, chatPanel, chatMessages }) {
  if (!(historySidebar instanceof HTMLElement)) {
    return {
      requestLayoutSync: () => {},
      applyMeasurements: () => {},
      observe: () => {},
    };
  }

  let rafId = null;
  let resizeObserver = null;

  const applyMeasurements = () => {
    const targetChatPanel = resolveChatPanel(chatPanel, chatMessages);
    if (!(targetChatPanel instanceof HTMLElement)) {
      historySidebar.style.removeProperty('--history-offset');
      historySidebar.style.removeProperty('--history-height');
      return;
    }

    const sidebarRect = historySidebar.getBoundingClientRect();
    const chatRect = targetChatPanel.getBoundingClientRect();
    const offset = Math.max(chatRect.top - sidebarRect.top, 0);
    const height = chatRect.height;

    if (!Number.isFinite(offset) || !Number.isFinite(height) || height <= 0) {
      historySidebar.style.removeProperty('--history-offset');
      historySidebar.style.removeProperty('--history-height');
      return;
    }

    historySidebar.style.setProperty('--history-offset', `${offset}px`);
    historySidebar.style.setProperty('--history-height', `${height}px`);
  };

  const requestLayoutSync = () => {
    if (typeof window === 'undefined') {
      return;
    }

    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
    }

    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      applyMeasurements();
    });
  };

  const observe = (target) => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }

    if (typeof ResizeObserver !== 'function') {
      return;
    }

    if (!(target instanceof HTMLElement)) {
      return;
    }

    resizeObserver = new ResizeObserver(() => {
      requestLayoutSync();
    });
    resizeObserver.observe(target);
  };

  return {
    applyMeasurements,
    requestLayoutSync,
    observe,
  };
}
