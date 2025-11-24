import {
  chatMessages,
  chatForm,
  userInput,
  cancelEditButton,
  chatEditingHint,
  chatPanel,
  appShell,
  statusPill,
  configForm,
  settingsToggle,
  settingsOverlay,
  settingsDrawer,
  settingsCloseButtons,
  historySidebar,
  historyToggle,
  historyPanel,
  conversationList,
  conversationEmptyState,
  newConversationButton,
  uploadButton,
  fileUploadInput,
  uploadedFilesCard,
  uploadedFileList,
  uploadedFilesEmpty,
} from '../elements.js';
import {
  getConversations,
  getCurrentConversation,
  findConversationByMessageId,
  findPreviousUserMessage,
  captureBranchSelections,
  ensureBranchBaseline,
  commitBranchTransition,
  syncActiveBranchSnapshots,
  saveConversationsToStorage,
  bumpConversation,
  generateConversationTitle,
  appendModelLogForConversation,
  setConversationWebPreview,
  setConversationPptSlides,
  setConversationWorkspaceState,
  cloneWorkspaceCheckpoint,
  composeWorkspaceBranchName,
} from '../conversationState.js';
import { fetchJson, postFormData } from '../utils.js';
import {
  logModelInvocation,
  updateWebPreview,
  updatePptPreview,
  initializePreviewControls,
} from '../previews.js';
import { loadConfig, initializeConfigForm } from '../config.js';
import { setMessageActionStatus, setMessageActionFeedback, setMessageActionsDisabled } from './messageActions.js';
import { createEditingController } from './editingController.js';
import { createHistoryLayoutManager } from './historyLayout.js';
import { createMessageRenderer } from './messageRenderer.js';
import { createStreamingController } from './streamingController.js';
import { createConversationPanel } from './conversationPanel.js';
import { assignWorkspaceBranch, restoreWorkspace } from '../workspaceApi.js';

let previousFocusedElement = null;

let uploadLimit = 100;
let maxFileSizeBytes = 100 * 1024 * 1024;

let uploadedFilesState = [];

const historyLayout = createHistoryLayoutManager({ historySidebar, chatPanel, chatMessages, appShell });
const sendButton = chatForm?.querySelector('.send-button') ?? null;

const defaultSendButtonLabel = sendButton?.textContent?.trim() || '发送';
const defaultInputPlaceholder = userInput?.getAttribute('placeholder') ?? '';
const editingHintFallback = '正在编辑历史消息，点击“发送”完成修改。';
const editingHintInitial = chatEditingHint?.textContent?.trim();
const defaultEditingHintText =
  editingHintInitial && editingHintInitial.length > 0 ? editingHintInitial : editingHintFallback;

if (chatEditingHint && (!editingHintInitial || editingHintInitial.length === 0)) {
  chatEditingHint.textContent = defaultEditingHintText;
}

let messageRendererApi = null;
let conversationPanelApi = null;

function sanitizeFileName(name) {
  if (typeof name !== 'string') return '';
  const parts = name.split(/[/\\]+/);
  const candidate = parts[parts.length - 1] ?? '';
  return candidate.trim();
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  if (bytes >= 1024 * 1024) {
    const value = bytes / (1024 * 1024);
    return `${value.toFixed(2).replace(/\.00$/, '')} MB`;
  }
  if (bytes >= 1024) {
    const value = bytes / 1024;
    return `${value.toFixed(2).replace(/\.00$/, '')} KB`;
  }
  return `${Math.round(bytes)} B`;
}

function updateUploadConstraints(source) {
  if (!source || typeof source !== 'object') {
    return;
  }

  const limitCandidate = Number(
    source.upload_limit ?? source.limit ?? source.max_files ?? source.maxFiles,
  );
  if (Number.isFinite(limitCandidate) && limitCandidate > 0) {
    uploadLimit = limitCandidate;
  }

  let sizeBytesCandidate = Number(
    source.max_upload_size_bytes ?? source.max_file_size_bytes,
  );
  if (!Number.isFinite(sizeBytesCandidate) || sizeBytesCandidate <= 0) {
    const sizeMbCandidate = Number(
      source.max_upload_size_mb ?? source.max_file_size_mb,
    );
    if (Number.isFinite(sizeMbCandidate) && sizeMbCandidate > 0) {
      sizeBytesCandidate = sizeMbCandidate * 1024 * 1024;
    }
  }

  if (Number.isFinite(sizeBytesCandidate) && sizeBytesCandidate > 0) {
    maxFileSizeBytes = sizeBytesCandidate;
  }
}

function workspaceSnapshotsEnabled(conversation) {
  if (!conversation || typeof conversation !== 'object') {
    return false;
  }
  const state = conversation.workspace;
  if (!state || typeof state !== 'object') {
    return false;
  }
  if (typeof state.enabled === 'boolean' && !state.enabled) {
    return false;
  }
  return true;
}

function resolveSnapshotId(version, conversation) {
  const candidates = [
    version?.workspace?.latest_snapshot,
    version?.workspace?.commit,
    conversation?.workspace?.latest_snapshot,
    conversation?.workspace?.git?.commit,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  const snapshots = conversation?.workspace?.snapshots;
  if (Array.isArray(snapshots) && snapshots.length > 0) {
    const latest = snapshots[0]?.id;
    if (typeof latest === 'string' && latest.trim()) {
      return latest.trim();
    }
  }
  return null;
}

function resolveBranchName(conversation, messageId, version) {
  const branch = version?.workspace?.branch;
  if (typeof branch === 'string' && branch.trim()) {
    return branch.trim();
  }
  return composeWorkspaceBranchName(conversation?.id, messageId, version?.id);
}

async function handleWorkspaceBranchTransition({ conversation, messageId, version }) {
  if (!conversation || !version || !messageId) {
    return;
  }
  if (!workspaceSnapshotsEnabled(conversation)) {
    return;
  }

  const snapshotId = resolveSnapshotId(version, conversation);
  if (!snapshotId) {
    return;
  }

  const branchName = resolveBranchName(conversation, messageId, version);
  if (!branchName) {
    return;
  }

  try {
    const response = await assignWorkspaceBranch({ branch: branchName, snapshotId, checkout: true });
    const summary = response?.workspace_state;
    if (summary) {
      setConversationWorkspaceState(summary, conversation.id);
      const checkpoint = cloneWorkspaceCheckpoint(summary);
      if (checkpoint) {
        version.workspace = {
          ...(version.workspace ?? {}),
          ...checkpoint,
        };
      }
      saveConversationsToStorage(conversation);
    }
  } catch (error) {
    console.error('Failed to assign workspace branch', error);
  }
}

async function restoreWorkspaceForVersion(conversation, messageId, version) {
  if (!conversation || !version || !messageId) {
    return null;
  }
  if (!workspaceSnapshotsEnabled(conversation)) {
    return null;
  }

  const snapshotId = resolveSnapshotId(version, conversation);
  const branchName = resolveBranchName(conversation, messageId, version);
  if (!snapshotId && !branchName) {
    return null;
  }

  const payload = {};
  if (snapshotId) {
    payload.snapshotId = snapshotId;
  }
  if (branchName) {
    payload.branch = branchName;
  }

  try {
    const response = await restoreWorkspace({
      branch: payload.branch,
      snapshotId: payload.snapshotId,
      checkout: true,
    });
    const summary = response?.workspace_state;
    if (summary) {
      setConversationWorkspaceState(summary, conversation.id);
      const checkpoint = cloneWorkspaceCheckpoint(summary);
      if (checkpoint) {
        version.workspace = {
          ...(version.workspace ?? {}),
          ...checkpoint,
        };
      }
      saveConversationsToStorage(conversation);
      return checkpoint;
    }
  } catch (error) {
    console.error('Failed to restore workspace state', error);
  }

  return null;
}

function getMaxFileSizeLimitMb() {
  if (!Number.isFinite(maxFileSizeBytes) || maxFileSizeBytes <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(maxFileSizeBytes / (1024 * 1024)));
}

function renderUploadedFiles() {
  if (!uploadedFilesCard || !uploadedFileList || !uploadedFilesEmpty) return;

  uploadedFilesCard.hidden = false;
  uploadedFileList.innerHTML = '';

  if (!uploadedFilesState || uploadedFilesState.length === 0) {
    uploadedFilesEmpty.hidden = false;
    return;
  }

  uploadedFilesEmpty.hidden = true;
  uploadedFilesState.forEach((file) => {
    const item = document.createElement('li');
    item.className = 'uploaded-file-entry';

    const name = document.createElement('span');
    name.className = 'uploaded-file-name';
    name.textContent = file.name;

    const meta = document.createElement('span');
    meta.className = 'uploaded-file-meta';
    const pathText = file.displayPath || file.path || file.name;
    meta.textContent = `${file.sizeDisplay} · ${pathText}`;

    item.append(name, meta);
    uploadedFileList.appendChild(item);
  });
}

function setUploadedFiles(files = []) {
  const entries = Array.isArray(files) ? files : [];
  uploadedFilesState = entries
    .map((file) => {
      const name = sanitizeFileName(file?.name);
      if (!name) return null;

      const rawPath = typeof file?.path === 'string' ? file.path : '';
      const displayPath =
        typeof file?.display_path === 'string' && file.display_path.trim()
          ? file.display_path.trim()
          : rawPath.replace(/^\//, '');

      const sizeBytesRaw = Number(file?.size_bytes ?? 0);
      const sizeBytes = Number.isFinite(sizeBytesRaw) && sizeBytesRaw > 0 ? sizeBytesRaw : 0;
      const sizeDisplay =
        typeof file?.size_display === 'string' && file.size_display.trim()
          ? file.size_display.trim()
          : formatFileSize(sizeBytes);

      return {
        name,
        path: rawPath,
        displayPath,
        sizeBytes,
        sizeDisplay,
      };
    })
    .filter(Boolean);

  renderUploadedFiles();
}

function getExistingUploadedFileNames() {
  return new Set(uploadedFilesState.map((entry) => entry.name));
}

function notifyUploadMessage(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) return;
  messageRendererApi?.addAndRenderMessage('assistant', normalized);
}

function handleUploadError(message) {
  notifyUploadMessage(message);
  setStatus('待命中…');
}

async function handleFileUploadSelection(fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length === 0) {
    if (fileUploadInput) {
      fileUploadInput.value = '';
    }
    return;
  }

  const prepared = [];
  const seenNames = new Set();
  for (const file of files) {
    const name = sanitizeFileName(file?.name);
    if (!name) {
      continue;
    }
    if (seenNames.has(name)) {
      handleUploadError(`存在重复文件：${name}`);
      if (fileUploadInput) fileUploadInput.value = '';
      return;
    }
    if (Number.isFinite(file.size) && file.size > maxFileSizeBytes) {
      const limitMb = getMaxFileSizeLimitMb();
      handleUploadError(`文件 ${name} 超过 ${limitMb} MB 限制`);
      if (fileUploadInput) fileUploadInput.value = '';
      return;
    }
    seenNames.add(name);
    prepared.push({ file, name });
  }

  if (prepared.length === 0) {
    handleUploadError('未找到有效的文件。');
    if (fileUploadInput) fileUploadInput.value = '';
    return;
  }

  const existingNames = getExistingUploadedFileNames();
  let projectedCount = existingNames.size;
  prepared.forEach(({ name }) => {
    if (!existingNames.has(name)) {
      projectedCount += 1;
    }
  });

  if (projectedCount > uploadLimit) {
    handleUploadError(`最多仅能上传 ${uploadLimit} 个文件。`);
    if (fileUploadInput) fileUploadInput.value = '';
    return;
  }

  const formData = new FormData();
  prepared.forEach(({ file, name }) => formData.append('files', file, name));

  setStatus('正在上传文件…', true);
  setInteractionDisabled(true);
  if (uploadButton) uploadButton.disabled = true;
  if (fileUploadInput) fileUploadInput.disabled = true;

  try {
    const response = await postFormData('/api/session/files', formData);
    updateUploadConstraints(response);
    setUploadedFiles(response?.files ?? []);
    const summaries = Array.isArray(response?.summaries)
      ? response.summaries.filter((entry) => typeof entry === 'string' && entry.trim())
      : [];
    if (summaries.length > 0) {
      notifyUploadMessage(summaries.join('\n'));
    } else {
      notifyUploadMessage('文件上传成功。');
    }
  } catch (error) {
    const message = error?.message ? String(error.message) : '文件上传失败。';
    notifyUploadMessage(message.startsWith('文件上传失败') ? message : `文件上传失败：${message}`);
  } finally {
    setStatus('待命中…');
    setInteractionDisabled(false);
    if (uploadButton) uploadButton.disabled = false;
    if (fileUploadInput) {
      fileUploadInput.disabled = false;
      fileUploadInput.value = '';
    }
  }
}

setUploadedFiles([]);

const editingController = createEditingController({
  chatForm,
  userInput,
  sendButton,
  cancelEditButton,
  chatEditingHint,
  defaultSendButtonLabel,
  defaultInputPlaceholder,
  defaultEditingHintText,
  findMessageElementById: (messageId) => messageRendererApi?.findMessageElementById(messageId) ?? null,
  renderConversationList: () => conversationPanelApi?.renderConversationList(),
  refreshConversationBranchNavigation: (conversation) =>
    messageRendererApi?.refreshConversationBranchNavigation(conversation),
  getConversations,
  bumpConversation,
  generateConversationTitle,
  commitBranchTransition,
  syncActiveBranchSnapshots,
  saveConversationsToStorage,
  setMessageActionsDisabled,
  afterBranchTransition: handleWorkspaceBranchTransition,
});

messageRendererApi = createMessageRenderer({
  chatMessages,
  userInput,
  sendButton,
  editingController,
  messageActions: {
    setMessageActionsDisabled,
  },
  onConversationListUpdated: () => conversationPanelApi?.renderConversationList(),
});

const streamingController = createStreamingController({
  finalizePendingMessage: (message, text, messageId) =>
    messageRendererApi.finalizePendingMessage(message, text, messageId),
});

conversationPanelApi = createConversationPanel({
  conversationList,
  conversationEmptyState,
  historySidebar,
  historyToggle,
  historyPanel,
  setStatus: (text, busy) => setStatus(text, busy),
  renderConversation: (conversation) => messageRendererApi.renderConversation(conversation),
  addAndRenderMessage: (role, text, options) =>
    messageRendererApi.addAndRenderMessage(role, text, options),
  requestHistoryLayoutSync: () => historyLayout.requestLayoutSync(),
  onSessionReset: () => {
    setUploadedFiles([]);
    bootSession();
  },
});

function setInteractionDisabled(disabled) {
  if (userInput) {
    userInput.disabled = disabled;
  }
  if (sendButton) {
    sendButton.disabled = disabled;
  }
  if (cancelEditButton) {
    cancelEditButton.disabled = disabled;
  }
}

function setStatus(text, busy = false) {
  if (!statusPill) return;
  statusPill.textContent = text;
  statusPill.dataset.busy = busy ? 'true' : 'false';
  historyLayout.requestLayoutSync();
}

async function writeToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn('Clipboard API write failed, falling back to execCommand.', error);
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previousRange = selection?.rangeCount ? selection.getRangeAt(0) : null;

  textarea.select();
  try {
    document.execCommand('copy');
  } catch (error) {
    console.error('Clipboard fallback failed', error);
    throw error;
  } finally {
    textarea.remove();
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }
}

async function handleBranchNavigation(messageId, delta) {
  if (!messageId || !Number.isInteger(delta)) return;
  const conversation = getCurrentConversation();
  if (!conversation) return;

  const branchState = conversation.branches?.[messageId];
  if (!branchState || !Array.isArray(branchState.versions) || branchState.versions.length === 0) return;

  const currentIndex = Number.isInteger(branchState.activeIndex) ? branchState.activeIndex : 0;
  const nextIndex = currentIndex + delta;
  if (nextIndex < 0 || nextIndex >= branchState.versions.length) return;

  const snapshot = branchState.versions[nextIndex];
  if (!snapshot) return;

  const restoredMessages = snapshot.messages.map((entry) => ({ ...entry }));
  conversation.messages = restoredMessages;

  const selections = snapshot.selections && typeof snapshot.selections === 'object' ? snapshot.selections : {};
  Object.entries(conversation.branches ?? {}).forEach(([key, state]) => {
    if (!state || !Array.isArray(state.versions) || state.versions.length === 0) return;
    if (key === messageId) return;
    const selection = selections[key];
    if (typeof selection === 'number' && selection >= 0 && selection < state.versions.length) {
      state.activeIndex = selection;
    }
  });

  const selectedIndex = selections[messageId];
  if (typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < branchState.versions.length) {
    branchState.activeIndex = selectedIndex;
  } else {
    branchState.activeIndex = nextIndex;
  }

  conversation.updatedAt = new Date().toISOString();
  bumpConversation(conversation.id);
  await restoreWorkspaceForVersion(conversation, messageId, snapshot);
  syncActiveBranchSnapshots(conversation);
  saveConversationsToStorage();
  conversationPanelApi.renderConversationList();
  messageRendererApi.renderConversation(conversation);
}

async function handleCopyMessageAction(messageId, button, messageElement) {
  if (!button) return;

  let content = '';

  if (messageElement?.dataset?.contentRaw) {
    content = messageElement.dataset.contentRaw;
  }

  const match = findConversationByMessageId(messageId);
  if (match) {
    const { conversation, messageIndex } = match;
    const message = conversation.messages[messageIndex];
    if (typeof message?.content === 'string' && message.content.length > 0) {
      content = message.content;
    }
  }

  if (!content && messageElement instanceof HTMLElement) {
    const body = messageElement.querySelector('.message-content');
    if (body) {
      content = body.innerText ?? body.textContent ?? '';
    }
  }

  if (!content) {
    setMessageActionFeedback(button, { status: 'error', message: '没有可复制的内容', duration: 1500 });
    return;
  }

  try {
    await writeToClipboard(content);
    setMessageActionFeedback(button, { status: 'success', message: '已复制' });
  } catch (error) {
    console.error(error);
    setMessageActionFeedback(button, { status: 'error', message: '复制失败', duration: 1500 });
  }
}

function handleEditMessageAction(messageElement, messageId, triggerButton) {
  if (!messageElement) return;
  const match = findConversationByMessageId(messageId);
  if (!match) return;
  const { conversation, messageIndex } = match;
  const message = conversation.messages[messageIndex];
  if (!message || message.role !== 'user') return;

  const previousMessages = conversation.messages.map((entry) => ({ ...entry }));
  const previousSelections = captureBranchSelections(conversation.branches);
  const previousWorkspace = cloneWorkspaceCheckpoint(conversation.workspace);

  const body = messageElement.querySelector('.message-content');
  const currentContent = typeof message.content === 'string' ? message.content : body?.textContent ?? '';
  const currentNormalized = (currentContent ?? '').replace(/\r\n/g, '\n');

  editingController.enterEditModeForMessage({
    conversation,
    message,
    initialValue: currentNormalized,
    previousMessages,
    previousSelections,
    previousWorkspace,
    messageElement,
    triggerButton,
  });
}

async function regenerateAssistantMessage(messageElement, messageId, button) {
  if (!messageElement || !button) return;
  const match = findConversationByMessageId(messageId);
  if (!match) return;
  const { conversation, messageIndex } = match;
  const assistantMessage = conversation.messages[messageIndex];
  if (!assistantMessage || assistantMessage.role !== 'assistant') return;

  const precedingUserMessage = findPreviousUserMessage(conversation, messageIndex);
  if (!precedingUserMessage) {
    setMessageActionFeedback(button, { status: 'error', message: '无法刷新', duration: 1500 });
    return;
  }

  const previousMessages = conversation.messages.map((entry) => ({ ...entry }));
  const previousSelections = captureBranchSelections(conversation.branches);
  const previousWorkspace = cloneWorkspaceCheckpoint(conversation.workspace);
  ensureBranchBaseline(conversation, precedingUserMessage.id);

  button.dataset.loading = 'true';
  setMessageActionStatus(button, '刷新中…');

  setStatus('重新生成中…', true);
  setInteractionDisabled(true);

  const placeholder = '正在重新生成回复…';
  messageRendererApi.markMessagePending(messageElement, placeholder);

  const timestamp = new Date().toISOString();
  assistantMessage.pending = true;
  assistantMessage.content = '';
  assistantMessage.timestamp = timestamp;
  conversation.updatedAt = timestamp;
  bumpConversation(conversation.id);
  saveConversationsToStorage();
  conversationPanelApi.renderConversationList();

  let branchTransitionCommitted = false;
  const finalizeBranchTransition = () => {
    if (branchTransitionCommitted) return null;
    branchTransitionCommitted = true;
    const activeVersion = commitBranchTransition(
      conversation,
      precedingUserMessage.id,
      previousMessages,
      previousSelections,
      previousWorkspace,
    );
    syncActiveBranchSnapshots(conversation);
    saveConversationsToStorage();
    conversationPanelApi.renderConversationList();
    messageRendererApi.refreshConversationBranchNavigation(conversation);
    return activeVersion ?? null;
  };

  try {
    const payload = await streamingController.runAssistantStream(messageElement, messageId, {
      message: precedingUserMessage.content,
      replace_last: true,
    });
    updateUploadConstraints(payload);
    if (payload.meta) {
      logModelInvocation(payload.meta);
      appendModelLogForConversation(payload.meta);
    }
    updateWebPreview(payload.web_preview);
    setConversationWebPreview(payload.web_preview);
    updatePptPreview(payload.ppt_slides);
    setConversationPptSlides(payload.ppt_slides);
    setConversationWorkspaceState(payload.workspace_state);
    setMessageActionFeedback(button, { status: 'success', message: '已刷新', duration: 1500 });
    const activeVersion = finalizeBranchTransition();
    if (activeVersion) {
      void handleWorkspaceBranchTransition({
        conversation,
        messageId: precedingUserMessage.id,
        version: activeVersion,
      });
    }
  } catch (error) {
    console.error(error);
    messageRendererApi.finalizePendingMessage(
      messageElement,
      `重新生成失败：${error?.message || '未知错误'}`,
      messageId,
    );
    setMessageActionFeedback(button, { status: 'error', message: '刷新失败', duration: 1500 });
    const activeVersion = finalizeBranchTransition();
    if (activeVersion) {
      void handleWorkspaceBranchTransition({
        conversation,
        messageId: precedingUserMessage.id,
        version: activeVersion,
      });
    }
  } finally {
    setStatus('待命中…');
    setInteractionDisabled(false);
    if (userInput) {
      userInput.focus();
    }
    delete button.dataset.loading;
  }
}

function resolveUserInputField(form) {
  if (form instanceof HTMLFormElement) {
    const fallback = form.querySelector('#user-input, textarea[name="message"]');
    if (fallback instanceof HTMLTextAreaElement || fallback instanceof HTMLInputElement) {
      return fallback;
    }
  }
  const globalFallback = document.getElementById('user-input');
  return globalFallback instanceof HTMLTextAreaElement || globalFallback instanceof HTMLInputElement
    ? globalFallback
    : null;
}

async function bootSession() {
  try {
    const data = await fetchJson('/api/session/boot');
    messageRendererApi.addAndRenderMessage('assistant', data.reply);
    updateUploadConstraints(data);
    if (data?.meta) {
      logModelInvocation(data.meta);
      appendModelLogForConversation(data.meta);
    }
    if (data && typeof data === 'object') {
      if ('web_preview' in data) {
        updateWebPreview(data.web_preview);
        setConversationWebPreview(data.web_preview);
      }
      if ('ppt_slides' in data) {
        updatePptPreview(data.ppt_slides);
        setConversationPptSlides(data.ppt_slides);
      }
      if ('workspace_state' in data) {
        setConversationWorkspaceState(data.workspace_state);
      }
      if (Array.isArray(data.uploads)) {
        setUploadedFiles(data.uploads);
      }
    }
  } catch (error) {
    console.error(error);
    messageRendererApi.addAndRenderMessage('assistant', '无法连接到后端服务，请确认已启动。');
    setUploadedFiles([]);
  } finally {
    setStatus('待命中…');
  }
}

async function sendChat(message) {
  setStatus('创意生成中…', true);
  setInteractionDisabled(true);
  const { messageId: pendingMessageId, messageElement: pendingMessage } =
    messageRendererApi.addAndRenderMessage('assistant', '正在生成回复…', { pending: true });
  try {
    const payload = await streamingController.runAssistantStream(pendingMessage, pendingMessageId, { message });
    updateUploadConstraints(payload);
    if (payload?.meta) {
      logModelInvocation(payload.meta);
      appendModelLogForConversation(payload.meta);
    }
    updateWebPreview(payload.web_preview);
    setConversationWebPreview(payload.web_preview);
    updatePptPreview(payload.ppt_slides);
    setConversationPptSlides(payload.ppt_slides);
    setConversationWorkspaceState(payload.workspace_state);
    if (Array.isArray(payload?.uploads)) {
      setUploadedFiles(payload.uploads);
    }
  } catch (error) {
    console.error(error);
    messageRendererApi.finalizePendingMessage(
      pendingMessage,
      `抱歉，发生错误：${error?.message || '未知错误'}`,
      pendingMessageId,
    );
  } finally {
    setStatus('待命中…');
    setInteractionDisabled(false);
    if (userInput) {
      userInput.value = '';
      userInput.focus();
    }
  }
}

function handleUserSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : chatForm;
  const input = resolveUserInputField(form);
  if (!input) return;
  const rawValue = typeof input.value === 'string' ? input.value : '';

  if (editingController.isEditing()) {
    editingController.applyActiveEdit();
    return;
  }

  const value = rawValue.trim();
  if (!value) return;
  messageRendererApi.addAndRenderMessage('user', value);
  sendChat(value);
}

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

function initializeEventListeners() {
  if (chatForm) {
    chatForm.addEventListener('submit', handleUserSubmit);
  }

  if (userInput) {
    userInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (event.isComposing) return;
      if (!event.ctrlKey && !event.metaKey) return;

      if (editingController.isEditing()) {
        event.preventDefault();
        editingController.applyActiveEdit();
        return;
      }

      if (!chatForm) return;
      event.preventDefault();
      if (typeof chatForm.requestSubmit === 'function') {
        chatForm.requestSubmit();
      } else {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        chatForm.dispatchEvent(submitEvent);
      }
    });
  }

  if (cancelEditButton) {
    cancelEditButton.addEventListener('click', () => {
      editingController.cancelActiveEdit({ focusInput: true });
    });
  }

  if (uploadButton && fileUploadInput) {
    uploadButton.addEventListener('click', () => {
      if (fileUploadInput.disabled) return;
      fileUploadInput.click();
    });

    fileUploadInput.addEventListener('change', (event) => {
      const target = event?.currentTarget ?? event?.target;
      handleFileUploadSelection(target?.files ?? null);
    });
  }

  if (chatMessages) {
    chatMessages.addEventListener('click', async (event) => {
      const origin = event.target instanceof Element ? event.target : event.target.parentElement;
      if (!origin) return;

      const navButton = origin.closest('button.branch-nav-button');
      if (navButton instanceof HTMLElement && chatMessages.contains(navButton)) {
        event.preventDefault();
        event.stopPropagation();
        const direction = navButton.dataset.direction;
        const messageElement = navButton.closest('.message');
        const messageId = messageElement?.dataset?.messageId;
        if (messageId && (direction === 'prev' || direction === 'next')) {
          const delta = direction === 'prev' ? -1 : 1;
          await handleBranchNavigation(messageId, delta);
        }
        return;
      }

      const target = origin.closest('button.message-action');
      if (!target || !chatMessages.contains(target)) return;

      const action = target.dataset.action;
      if (!action) return;

      const messageElement = target.closest('.message');
      const messageId = messageElement?.dataset.messageId;
      if (!messageElement || !messageId) return;

      event.preventDefault();
      event.stopPropagation();

      switch (action) {
        case 'copy':
          await handleCopyMessageAction(messageId, target, messageElement);
          break;
        case 'edit':
          handleEditMessageAction(messageElement, messageId, target);
          break;
        case 'refresh':
          await regenerateAssistantMessage(messageElement, messageId, target);
          break;
        default:
          break;
      }
    });
  }

  if (historyToggle) {
    historyToggle.addEventListener('click', () => {
      const isOpen = conversationPanelApi.toggleHistoryPanel();
      if (!isOpen) {
        historyToggle.focus();
      }
    });
  }

  if (conversationList) {
    conversationList.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : event.target.parentElement;
      if (!target) return;

      const deleteButton = target.closest('button[data-action="delete"]');
      if (deleteButton instanceof HTMLElement && conversationList.contains(deleteButton)) {
        event.preventDefault();
        event.stopPropagation();
        const { conversationId } = deleteButton.dataset;
        if (conversationId) {
          conversationPanelApi.deleteConversation(conversationId).catch((error) => console.error(error));
        }
        return;
      }

      const conversationButton = target.closest('.conversation-item');
      if (!conversationButton || !conversationList.contains(conversationButton)) return;

      const { conversationId } = conversationButton.dataset;
      if (conversationId) {
        conversationPanelApi.selectConversation(conversationId);
      }
    });
  }

  if (newConversationButton) {
    newConversationButton.addEventListener('click', () => {
      conversationPanelApi.startNewConversation().catch((error) => console.error(error));
    });
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
    if (event.key !== 'Escape') return;
    if (editingController.isEditing()) {
      event.preventDefault();
      editingController.cancelActiveEdit({ focusInput: true });
      return;
    }
    if (!settingsOverlay?.hidden) {
      event.preventDefault();
      closeSettingsPanel();
      return;
    }
    if (conversationPanelApi.isHistoryOpen()) {
      event.preventDefault();
      conversationPanelApi.setHistoryOpen(false);
      historyToggle?.focus();
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initializePreviewControls();
  initializeConfigForm();
  initializeEventListeners();

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', historyLayout.requestLayoutSync);
  }

  const observedLayoutTarget =
    appShell instanceof HTMLElement
      ? appShell
      : chatPanel instanceof HTMLElement
        ? chatPanel
        : chatMessages?.closest('.chat-panel');
  historyLayout.observe(observedLayoutTarget);
  historyLayout.requestLayoutSync();

  const conversation = await conversationPanelApi.initializeConversationState();
  loadConfig();

  if (!conversation || conversation.messages.length === 0) {
    setStatus('连接工作台…', true);
    bootSession();
  } else {
    setStatus('待命中…');
    if (userInput) {
      userInput.focus();
    }
  }
});
