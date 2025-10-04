function resolveChatPanel(chatPanel, chatMessages) {
  if (chatPanel instanceof HTMLElement) {
    return chatPanel;
  }
  return chatMessages?.closest?.('.chat-panel') ?? null;
}

export function createHistoryLayoutManager({ historySidebar, chatPanel, chatMessages, appShell }) {
  if (!(historySidebar instanceof HTMLElement)) {
    return {
      requestLayoutSync: () => {},
      applyMeasurements: () => {},
      observe: () => {},
    };
  }

  let rafId = null;
  let resizeObserver = null;

  const resolveLayoutTarget = () => {
    if (appShell instanceof HTMLElement) {
      return appShell;
    }
    return resolveChatPanel(chatPanel, chatMessages);
  };

  const applyMeasurements = () => {
    const layoutTarget = resolveLayoutTarget();
    if (!(layoutTarget instanceof HTMLElement)) {
      historySidebar.style.removeProperty('--history-offset');
      historySidebar.style.removeProperty('--history-height');
      return;
    }

    const sidebarRect = historySidebar.getBoundingClientRect();
    const layoutRect = layoutTarget.getBoundingClientRect();
    const offset = Math.max(layoutRect.top - sidebarRect.top, 0);
    const height = layoutRect.height;

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

    const resolvedTarget = target instanceof HTMLElement ? target : resolveLayoutTarget();
    if (!(resolvedTarget instanceof HTMLElement)) {
      return;
    }

    resizeObserver = new ResizeObserver(() => {
      requestLayoutSync();
    });
    resizeObserver.observe(resolvedTarget);
  };

  return {
    applyMeasurements,
    requestLayoutSync,
    observe,
  };
}
