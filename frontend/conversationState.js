import {
  DEFAULT_CONVERSATION_TITLE,
  CONVERSATION_TITLE_MAX_LENGTH,
} from './constants.js';
import { generateId } from './utils.js';
import {
  fetchConversations,
  updateConversationOnServer,
  deleteConversationOnServer,
} from './conversationApi.js';

let conversations = [];
let currentSessionId = null;

// 多标签页状态管理
let conversationTabs = [];
let activeTabId = null;

const MODEL_LOG_LIMIT = 6;

function cloneConversation(conversation) {
  if (!conversation || typeof conversation !== 'object') {
    return null;
  }
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(conversation);
    } catch (error) {
      // Fallback to JSON cloning
    }
  }
  try {
    return JSON.parse(JSON.stringify(conversation));
  } catch (error) {
    return null;
  }
}

function createPersistenceController() {
  const pendingSaves = new Map();
  const pendingDeletes = new Set();
  let flushing = false;

  const dequeueDelete = () => {
    const iterator = pendingDeletes.values().next();
    if (iterator.done) return null;
    const value = iterator.value;
    pendingDeletes.delete(value);
    return value;
  };

  const dequeueSave = () => {
    const iterator = pendingSaves.entries().next();
    if (iterator.done) return null;
    const [conversationId, payload] = iterator.value;
    pendingSaves.delete(conversationId);
    return payload;
  };

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      while (pendingDeletes.size > 0 || pendingSaves.size > 0) {
        const deleteId = dequeueDelete();
        if (deleteId) {
          try {
            await deleteConversationOnServer(deleteId);
          } catch (error) {
            console.error('删除会话失败', deleteId, error);
          }
          continue;
        }

        const payload = dequeueSave();
        if (payload) {
          try {
            await updateConversationOnServer(payload);
          } catch (error) {
            console.error('保存会话失败', payload?.id, error);
          }
        }
      }
    } finally {
      flushing = false;
      if (pendingDeletes.size > 0 || pendingSaves.size > 0) {
        void flush();
      }
    }
  };

  return {
    scheduleSave(conversation) {
      const payload = cloneConversation(conversation);
      if (!payload?.id) return;
      pendingSaves.set(payload.id, payload);
      pendingDeletes.delete(payload.id);
      void flush();
    },
    scheduleDelete(conversationId) {
      if (!conversationId) return;
      pendingSaves.delete(conversationId);
      pendingDeletes.add(conversationId);
      void flush();
    },
  };
}

const persistenceController = createPersistenceController();

function normalizeModelLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
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
    model: toString(entry.model).trim(),
    timestamp: toString(entry.timestamp).trim(),
    summary: toString(entry.summary).trim(),
    tokensIn: toString(entry.tokensIn).trim(),
    tokensOut: toString(entry.tokensOut).trim(),
    latency: toString(entry.latency).trim(),
  };
  const hasContent = normalized.model || normalized.summary || normalized.timestamp;
  return hasContent ? normalized : null;
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

function normalizePptSlides(slides) {
  if (!Array.isArray(slides)) {
    return [];
  }

  return slides
    .map((slide) => {
      if (!slide || typeof slide !== 'object') return null;
      const title = typeof slide.title === 'string' ? slide.title.trim() : '';
      const bullets = Array.isArray(slide.bullets)
        ? slide.bullets
            .map((bullet) => (typeof bullet === 'string' ? bullet : ''))
            .filter((bullet) => bullet && bullet.trim().length > 0)
        : [];
      if (!title && bullets.length === 0) {
        return null;
      }
      return {
        title: title || '未命名幻灯片',
        bullets,
      };
    })
    .filter(Boolean);
}

function normalizeConversationOutputs(outputs) {
  const normalized = {
    modelLogs: [],
    webPreview: null,
    pptSlides: [],
  };

  if (!outputs || typeof outputs !== 'object') {
    return normalized;
  }

  if (Array.isArray(outputs.modelLogs)) {
    outputs.modelLogs.forEach((entry) => {
      const normalizedEntry = normalizeModelLogEntry(entry);
      if (normalizedEntry) {
        normalized.modelLogs.push(normalizedEntry);
      }
    });
    if (normalized.modelLogs.length > MODEL_LOG_LIMIT) {
      normalized.modelLogs = normalized.modelLogs.slice(-MODEL_LOG_LIMIT);
    }
  }

  const preview = normalizeWebPreview(outputs.webPreview ?? outputs.preview ?? outputs);
  if (preview) {
    normalized.webPreview = preview;
  }

  const slides = normalizePptSlides(outputs.pptSlides ?? outputs.slides);
  if (slides.length > 0) {
    normalized.pptSlides = slides;
  }

  return normalized;
}

function normalizeWorkspaceCheckpoint(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') {
    return null;
  }

  const normalized = {};

  if (typeof checkpoint.enabled === 'boolean') {
    normalized.enabled = checkpoint.enabled;
  }

  const snapshotCandidate =
    typeof checkpoint.latest_snapshot === 'string'
      ? checkpoint.latest_snapshot
      : typeof checkpoint.snapshot_id === 'string'
        ? checkpoint.snapshot_id
        : typeof checkpoint.commit === 'string'
          ? checkpoint.commit
          : null;
  if (snapshotCandidate) {
    normalized.latest_snapshot = snapshotCandidate;
  }

  if (typeof checkpoint.commit === 'string' && checkpoint.commit.trim()) {
    normalized.commit = checkpoint.commit.trim();
    if (!normalized.latest_snapshot) {
      normalized.latest_snapshot = normalized.commit;
    }
  }

  if (typeof checkpoint.branch === 'string' && checkpoint.branch.trim()) {
    normalized.branch = checkpoint.branch.trim();
  }

  if (typeof checkpoint.is_dirty === 'boolean') {
    normalized.is_dirty = checkpoint.is_dirty;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeWorkspaceState(state) {
  if (!state || typeof state !== 'object') {
    return null;
  }

  const normalized = {};

  if (typeof state.enabled === 'boolean') {
    normalized.enabled = state.enabled;
  }

  if (Array.isArray(state.snapshots)) {
    normalized.snapshots = state.snapshots
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        id: typeof entry.id === 'string' ? entry.id : null,
        label: typeof entry.label === 'string' ? entry.label : null,
        timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : null,
      }))
      .filter((entry) => entry.id || entry.label || entry.timestamp);
  } else {
    normalized.snapshots = [];
  }

  const latestSnapshot =
    typeof state.latest_snapshot === 'string'
      ? state.latest_snapshot
      : typeof state.latestSnapshot === 'string'
        ? state.latestSnapshot
        : null;
  if (latestSnapshot) {
    normalized.latest_snapshot = latestSnapshot;
  }

  const pathsSource = state.paths && typeof state.paths === 'object' ? state.paths : null;
  if (pathsSource) {
    const paths = {};
    const copyIfString = (key, sourceKey = key) => {
      const value = pathsSource[sourceKey];
      if (typeof value === 'string' && value.trim()) {
        paths[key] = value.trim();
      }
    };
    copyIfString('mount');
    copyIfString('output');
    copyIfString('internal_root');
    copyIfString('internal_output');
    copyIfString('internal_mount');
    copyIfString('internal_tmp');
    copyIfString('storage_root');
    copyIfString('deployments_root');
    copyIfString('session_id');
    copyIfString('session_id', 'sessionId');
    if (Object.keys(paths).length > 0) {
      normalized.paths = paths;
    }
  }

  const gitSource = state.git && typeof state.git === 'object' ? state.git : null;
  if (gitSource) {
    const git = {};
    if (typeof gitSource.commit === 'string' && gitSource.commit.trim()) {
      git.commit = gitSource.commit.trim();
    }
    if (typeof gitSource.branch === 'string' && gitSource.branch.trim()) {
      git.branch = gitSource.branch.trim();
    }
    if (typeof gitSource.is_dirty === 'boolean') {
      git.is_dirty = gitSource.is_dirty;
    } else if (typeof gitSource.isDirty === 'boolean') {
      git.is_dirty = gitSource.isDirty;
    }
    if (Object.keys(git).length > 0) {
      normalized.git = git;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function cloneWorkspaceCheckpoint(state) {
  const normalized = normalizeWorkspaceCheckpoint(state);
  if (!normalized) {
    return null;
  }
  return {
    ...(typeof normalized.enabled === 'boolean' ? { enabled: normalized.enabled } : {}),
    ...(normalized.latest_snapshot ? { latest_snapshot: normalized.latest_snapshot } : {}),
    ...(normalized.commit ? { commit: normalized.commit } : {}),
    ...(normalized.branch ? { branch: normalized.branch } : {}),
    ...(typeof normalized.is_dirty === 'boolean' ? { is_dirty: normalized.is_dirty } : {}),
  };
}

export function composeWorkspaceBranchName(conversationId, messageId, versionId) {
  const parts = [conversationId, messageId, versionId]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
  if (parts.length === 0) {
    return null;
  }
  return parts.join('-');
}

function ensureConversationOutputs(conversation) {
  if (!conversation || typeof conversation !== 'object') return null;
  if (!conversation.outputs || typeof conversation.outputs !== 'object') {
    conversation.outputs = normalizeConversationOutputs(null);
    return conversation.outputs;
  }
  const normalized = normalizeConversationOutputs(conversation.outputs);
  conversation.outputs = normalized;
  return conversation.outputs;
}

export function getConversations() {
  return conversations;
}

export function getCurrentSessionId() {
  return currentSessionId;
}

export function setCurrentSessionId(sessionId) {
  currentSessionId = sessionId ?? null;
}

export function generateConversationTitle(content, { fallbackToDefault = true } = {}) {
  const normalized = typeof content === 'string' ? content.trim() : '';
  if (!normalized) {
    return fallbackToDefault ? DEFAULT_CONVERSATION_TITLE : null;
  }
  return normalized.length > CONVERSATION_TITLE_MAX_LENGTH
    ? `${normalized.slice(0, CONVERSATION_TITLE_MAX_LENGTH)}…`
    : normalized;
}

export function cloneMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((entry) => ({
    id: entry?.id ?? generateId(),
    role: entry?.role === 'assistant' ? 'assistant' : 'user',
    content: typeof entry?.content === 'string' ? entry.content : '',
    timestamp: typeof entry?.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
    pending: Boolean(entry?.pending),
  }));
}

export function computeMessageSignature(messages) {
  const payload = (Array.isArray(messages) ? messages : []).map((entry) => [
    entry?.id ?? '',
    entry?.role === 'assistant' ? 'assistant' : 'user',
    typeof entry?.content === 'string' ? entry.content : '',
    typeof entry?.timestamp === 'string' ? entry.timestamp : '',
    entry?.pending ? 1 : 0,
  ]);
  return JSON.stringify(payload);
}

export function captureBranchSelections(branches, overrides = {}) {
  if (!branches || typeof branches !== 'object') return {};
  const selections = {};
  Object.entries(branches).forEach(([messageId, state]) => {
    if (!state || !Array.isArray(state.versions) || state.versions.length === 0) return;
    const override = overrides[messageId];
    const index = Number.isInteger(override)
      ? override
      : Number.isInteger(state.activeIndex)
        ? state.activeIndex
        : 0;
    selections[messageId] = Math.max(0, Math.min(index, state.versions.length - 1));
  });
  return selections;
}

export function ensureBranchState(conversation, messageId) {
  if (!conversation || !messageId) return null;
  if (!conversation.branches || typeof conversation.branches !== 'object') {
    conversation.branches = {};
  }
  if (!conversation.branches[messageId]) {
    conversation.branches[messageId] = {
      messageId,
      versions: [],
      activeIndex: 0,
    };
  }
  return conversation.branches[messageId];
}

export function ensureBranchBaseline(conversation, messageId) {
  const state = ensureBranchState(conversation, messageId);
  if (!state) return null;
  if (!Array.isArray(state.versions) || state.versions.length === 0) {
    const snapshot = cloneMessages(conversation.messages);
    const signature = computeMessageSignature(snapshot);
    const selections = captureBranchSelections(conversation.branches, { [messageId]: 0 });
    const workspace = cloneWorkspaceCheckpoint(conversation.workspace);
    state.versions = [
      {
        id: generateId(),
        signature,
        messages: snapshot,
        selections,
        createdAt: new Date().toISOString(),
        ...(workspace ? { workspace } : {}),
      },
    ];
    state.activeIndex = 0;
  }
  return state;
}

export function commitBranchTransition(
  conversation,
  messageId,
  previousMessages,
  previousSelections = {},
  previousWorkspace = null,
) {
  if (!conversation || !messageId) return;
  const state = ensureBranchState(conversation, messageId);
  if (!state) return;

  const timestamp = new Date().toISOString();
  const previousSnapshot = cloneMessages(previousMessages);
  const previousSignature = computeMessageSignature(previousSnapshot);
  const nextSnapshot = cloneMessages(conversation.messages);
  const nextSignature = computeMessageSignature(nextSnapshot);
  const previousWorkspaceCheckpoint = cloneWorkspaceCheckpoint(previousWorkspace);
  const nextWorkspaceCheckpoint = cloneWorkspaceCheckpoint(conversation.workspace);

  let previousIndex = state.versions.findIndex((version) => version.signature === previousSignature);
  const hasDistinctPreviousVersion = state.versions.some(
    (version, index) => index !== previousIndex && version.signature === previousSignature,
  );
  const shouldInsertPrevious =
    previousIndex === -1 || (previousSignature === nextSignature && !hasDistinctPreviousVersion);
  if (shouldInsertPrevious) {
    state.versions.push({
      id: generateId(),
      signature: previousSignature,
      messages: previousSnapshot,
      selections: { ...previousSelections },
      createdAt: timestamp,
      ...(previousWorkspaceCheckpoint ? { workspace: previousWorkspaceCheckpoint } : {}),
    });
    previousIndex = state.versions.length - 1;
  } else if (previousIndex !== -1 && previousWorkspaceCheckpoint) {
    const target = state.versions[previousIndex];
    target.workspace = {
      ...(target.workspace ?? {}),
      ...previousWorkspaceCheckpoint,
    };
  }

  let nextIndex = state.versions.findIndex((version) => version.signature === nextSignature);
  if (nextIndex === -1 || previousSignature === nextSignature) {
    const overrideIndex = state.versions.length;
    const nextSelections = captureBranchSelections(conversation.branches, { [messageId]: overrideIndex });
    state.versions.push({
      id: generateId(),
      signature: nextSignature,
      messages: nextSnapshot,
      selections: nextSelections,
      createdAt: timestamp,
      ...(nextWorkspaceCheckpoint ? { workspace: nextWorkspaceCheckpoint } : {}),
    });
    nextIndex = state.versions.length - 1;
  } else if (nextWorkspaceCheckpoint) {
    const target = state.versions[nextIndex];
    target.workspace = {
      ...(target.workspace ?? {}),
      ...nextWorkspaceCheckpoint,
    };
  }

  if (previousIndex !== -1 && nextIndex !== -1 && previousIndex > nextIndex) {
    const [previousVersion] = state.versions.splice(previousIndex, 1);
    state.versions.splice(nextIndex, 0, previousVersion);
    previousIndex = nextIndex;
    nextIndex += 1;
  }

  const boundedNextIndex = Math.max(0, Math.min(nextIndex, state.versions.length - 1));
  state.activeIndex = boundedNextIndex;
  const activeSelections = captureBranchSelections(conversation.branches);
  const activeVersion = state.versions[state.activeIndex];
  if (activeVersion) {
    activeVersion.messages = cloneMessages(conversation.messages);
    activeVersion.signature = computeMessageSignature(activeVersion.messages);
    activeVersion.selections = activeSelections;
    activeVersion.createdAt = activeVersion.createdAt ?? timestamp;
    if (nextWorkspaceCheckpoint) {
      activeVersion.workspace = {
        ...(activeVersion.workspace ?? {}),
        ...nextWorkspaceCheckpoint,
      };
    }
  }

  return activeVersion ?? null;
}

export function syncActiveBranchSnapshots(conversation) {
  if (!conversation?.branches || typeof conversation.branches !== 'object') return;
  const activeSelections = captureBranchSelections(conversation.branches);
  const snapshot = cloneMessages(conversation.messages);
  const signature = computeMessageSignature(snapshot);
  const workspaceCheckpoint = cloneWorkspaceCheckpoint(conversation.workspace);
  Object.values(conversation.branches).forEach((state) => {
    if (!state || !Array.isArray(state.versions) || state.versions.length === 0) return;
    const index = Number.isInteger(state.activeIndex) ? state.activeIndex : 0;
    const targetIndex = Math.max(0, Math.min(index, state.versions.length - 1));
    state.activeIndex = targetIndex;
    const version = state.versions[targetIndex];
    if (version) {
      version.messages = cloneMessages(snapshot);
      version.signature = signature;
      version.selections = { ...activeSelections };
      if (workspaceCheckpoint) {
        version.workspace = {
          ...(version.workspace ?? {}),
          ...workspaceCheckpoint,
        };
      }
    }
  });
}

export function findConversationByMessageId(messageId) {
  if (!messageId) return null;
  for (const conversation of conversations) {
    const messageIndex = conversation.messages.findIndex((message) => message.id === messageId);
    if (messageIndex !== -1) {
      return { conversation, messageIndex };
    }
  }
  return null;
}

export function findPreviousUserMessage(conversation, fromIndex) {
  if (!conversation) return null;
  for (let index = fromIndex - 1; index >= 0; index -= 1) {
    const entry = conversation.messages[index];
    if (entry?.role === 'user' && typeof entry.content === 'string' && entry.content.trim().length > 0) {
      return entry;
    }
  }
  return null;
}

function normalizeConversation(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const now = new Date().toISOString();

  const normalizeMessage = (message) => {
    if (!message || typeof message !== 'object') return null;
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof message.content === 'string' ? message.content : '';
    const timestamp =
      typeof message.timestamp === 'string' && !Number.isNaN(Date.parse(message.timestamp))
        ? message.timestamp
        : now;
    return {
      id: typeof message.id === 'string' && message.id ? message.id : generateId(),
      role,
      content,
      timestamp,
      pending: Boolean(message.pending),
    };
  };

  const normalized = {
    id: typeof entry.id === 'string' && entry.id ? entry.id : generateId(),
    title:
      typeof entry.title === 'string' && entry.title.trim().length > 0
        ? entry.title.trim()
        : DEFAULT_CONVERSATION_TITLE,
    createdAt:
      typeof entry.createdAt === 'string' && !Number.isNaN(Date.parse(entry.createdAt))
        ? entry.createdAt
        : now,
    updatedAt:
      typeof entry.updatedAt === 'string' && !Number.isNaN(Date.parse(entry.updatedAt))
        ? entry.updatedAt
        : entry.createdAt ?? now,
    messages: Array.isArray(entry.messages)
      ? entry.messages.map((message) => normalizeMessage(message)).filter(Boolean)
      : [],
    branches: {},
    outputs: normalizeConversationOutputs(entry.outputs),
    workspace: normalizeWorkspaceState(entry.workspace),
  };

  if (entry.branches && typeof entry.branches === 'object') {
    Object.entries(entry.branches).forEach(([messageId, state]) => {
      if (!state || typeof state !== 'object') return;
      const normalizedState = ensureBranchState({ branches: {} }, messageId);
      normalizedState.activeIndex = Number.isInteger(state.activeIndex) ? state.activeIndex : 0;
      normalizedState.versions = Array.isArray(state.versions)
        ? state.versions
            .map((version) => {
              if (!version || typeof version !== 'object') return null;
              const messages = Array.isArray(version.messages)
                ? version.messages.map((message) => normalizeMessage(message)).filter(Boolean)
                : [];
              const signature = typeof version.signature === 'string'
                ? version.signature
                : computeMessageSignature(messages);
              const selections =
                version.selections && typeof version.selections === 'object'
                  ? Object.entries(version.selections).reduce((acc, [key, value]) => {
                      if (typeof value === 'number' && Number.isFinite(value)) {
                        acc[key] = Math.max(0, Math.floor(value));
                      }
                      return acc;
                    }, {})
                  : {};
              const createdAt =
                typeof version.createdAt === 'string' && !Number.isNaN(Date.parse(version.createdAt))
                  ? version.createdAt
                  : now;
              const workspace = normalizeWorkspaceCheckpoint(version.workspace);
              return {
                id: typeof version.id === 'string' && version.id ? version.id : generateId(),
                messages,
                signature,
                selections,
                createdAt,
                ...(workspace ? { workspace } : {}),
              };
            })
            .filter(Boolean)
        : [];

      if (normalizedState.versions.length > 0) {
        const boundedIndex = Math.max(
          0,
          Math.min(normalizedState.activeIndex, normalizedState.versions.length - 1),
        );
        normalizedState.activeIndex = boundedIndex;
        normalized.branches[messageId] = normalizedState;
      }
    });
  }

  return normalized;
}

export async function loadConversationsFromStorage() {
  try {
    const payload = await fetchConversations();
    const entries = Array.isArray(payload?.conversations) ? payload.conversations : [];
    conversations = entries
      .map((entry) => normalizeConversation(entry))
      .filter((entry) => entry !== null);
  } catch (error) {
    console.error('加载会话失败', error);
    conversations = [];
  }

  conversations.forEach((conversation) => {
    syncActiveBranchSnapshots(conversation);
    ensureConversationOutputs(conversation);
  });

  if (!getCurrentConversation() && conversations.length > 0) {
    currentSessionId = conversations[0].id;
  }

  return conversations;
}

export function saveConversationsToStorage(conversation = getCurrentConversation()) {
  if (!conversation) return;
  persistenceController.scheduleSave(conversation);
}

export function getCurrentConversation() {
  return conversations.find((conversation) => conversation.id === currentSessionId) ?? null;
}

function findConversationById(conversationId) {
  if (!conversationId) return null;
  return conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

export function discardConversation(conversationId) {
  if (!conversationId) return null;
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index === -1) return null;
  const [removed] = conversations.splice(index, 1);
  if (removed?.id === currentSessionId) {
    currentSessionId = null;
  }
  if (removed?.id) {
    persistenceController.scheduleDelete(removed.id);
  }
  return { conversation: removed, index };
}

export function restoreConversation(conversation, index = 0) {
  const normalized = normalizeConversation(conversation);
  if (!normalized) return null;
  const targetIndex = Math.max(0, Math.min(index, conversations.length));
  conversations.splice(targetIndex, 0, normalized);
  syncActiveBranchSnapshots(normalized);
  ensureConversationOutputs(normalized);
  saveConversationsToStorage(normalized);
  return normalized;
}

function resolveConversationForOutputs(conversationId) {
  if (conversationId) {
    return findConversationById(conversationId);
  }
  return getCurrentConversation();
}

export function ensureCurrentConversation() {
  if (getCurrentConversation()) return;
  if (conversations.length === 0) {
    createConversation();
    return;
  }
  currentSessionId = conversations[0].id;
}

export function createConversation(options = {}) {
  const now = new Date().toISOString();
  const conversation = {
    id: generateId(),
    title: options.title ?? DEFAULT_CONVERSATION_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
    branches: {},
    outputs: normalizeConversationOutputs(null),
  };
  conversations.unshift(conversation);
  currentSessionId = conversation.id;
  saveConversationsToStorage(conversation);
  return conversation;
}

export function bumpConversation(conversationId) {
  const index = conversations.findIndex((conversation) => conversation.id === conversationId);
  if (index > 0) {
    const [entry] = conversations.splice(index, 1);
    conversations.unshift(entry);
  }
}

export function appendMessageToConversation(role, content, options = {}) {
  ensureCurrentConversation();
  const conversation = getCurrentConversation();
  if (!conversation) return null;

  const timestamp = new Date().toISOString();
  const message = {
    id: generateId(),
    role,
    content: typeof content === 'string' ? content : '',
    timestamp,
    pending: Boolean(options.pending),
  };

  conversation.messages.push(message);
  conversation.updatedAt = timestamp;

  if (role === 'user') {
    const nextTitle = generateConversationTitle(message.content);
    if (nextTitle !== DEFAULT_CONVERSATION_TITLE) {
      conversation.title = nextTitle;
    }
  }

  bumpConversation(conversation.id);
  syncActiveBranchSnapshots(conversation);
  saveConversationsToStorage(conversation);
  return message.id;
}

export function resolvePendingConversationMessage(messageId, content) {
  if (!messageId) return null;
  const timestamp = new Date().toISOString();
  const conversation = conversations.find((entry) => entry.messages.some((m) => m.id === messageId));
  if (!conversation) return null;

  const messageIndex = conversation.messages.findIndex((entry) => entry.id === messageId);
  if (messageIndex === -1) return null;
  const message = conversation.messages[messageIndex];
  message.content = typeof content === 'string' ? content : '';
  message.pending = false;
  message.timestamp = timestamp;
  conversation.updatedAt = timestamp;

  const precedingUserMessage = findPreviousUserMessage(conversation, messageIndex);
  if (precedingUserMessage) {
    ensureBranchBaseline(conversation, precedingUserMessage.id);
  }

  bumpConversation(conversation.id);
  syncActiveBranchSnapshots(conversation);
  saveConversationsToStorage(conversation);
  return conversation;
}

export function appendModelLogForConversation(log, conversationId = currentSessionId) {
  const conversation = resolveConversationForOutputs(conversationId);
  if (!conversation) return;
  const outputs = ensureConversationOutputs(conversation);
  const normalized = normalizeModelLogEntry(log);
  if (!normalized) return;
  outputs.modelLogs.push(normalized);
  if (outputs.modelLogs.length > MODEL_LOG_LIMIT) {
    outputs.modelLogs.splice(0, outputs.modelLogs.length - MODEL_LOG_LIMIT);
  }
  saveConversationsToStorage(conversation);
}

export function setConversationWebPreview(preview, conversationId = currentSessionId) {
  const conversation = resolveConversationForOutputs(conversationId);
  if (!conversation) return;
  const outputs = ensureConversationOutputs(conversation);
  outputs.webPreview = normalizeWebPreview(preview);
  saveConversationsToStorage(conversation);
}

export function setConversationPptSlides(slides, conversationId = currentSessionId) {
  const conversation = resolveConversationForOutputs(conversationId);
  if (!conversation) return;
  const outputs = ensureConversationOutputs(conversation);
  outputs.pptSlides = normalizePptSlides(slides);
  saveConversationsToStorage(conversation);
}

export function setConversationWorkspaceState(state, conversationId = currentSessionId) {
  const conversation = resolveConversationForOutputs(conversationId);
  if (!conversation) return;
  const normalized = normalizeWorkspaceState(state);
  if (normalized) {
    conversation.workspace = normalized;
  } else {
    delete conversation.workspace;
  }
  saveConversationsToStorage(conversation);
}

// ==================== 多标签页管理 ====================

export function getConversationTabs() {
  return conversationTabs;
}

export function getActiveTabId() {
  return activeTabId;
}

export function setActiveTabId(tabId) {
  activeTabId = tabId ?? null;
}

export function createConversationTab(conversationId = null) {
  const tabId = generateId();
  let targetConversationId = conversationId;

  // 如果没有指定会话ID，创建新会话
  if (!targetConversationId) {
    const conversation = createConversation();
    targetConversationId = conversation.id;
  }

  const tab = {
    id: tabId,
    conversationId: targetConversationId,
    createdAt: new Date().toISOString(),
  };

  conversationTabs.push(tab);
  activeTabId = tabId;
  currentSessionId = targetConversationId;

  saveTabsToStorage();
  return tab;
}

export function closeConversationTab(tabId) {
  if (!tabId) return null;

  const index = conversationTabs.findIndex(tab => tab.id === tabId);
  if (index === -1) return null;

  const [removed] = conversationTabs.splice(index, 1);

  // 如果关闭的是当前活动标签，切换到相邻标签
  if (activeTabId === tabId) {
    if (conversationTabs.length > 0) {
      // 优先切换到左边的标签，如果没有则切换到右边
      const newIndex = Math.min(index, conversationTabs.length - 1);
      const newTab = conversationTabs[newIndex];
      activeTabId = newTab.id;
      currentSessionId = newTab.conversationId;
    } else {
      // 没有标签了，创建一个新的
      const newTab = createConversationTab();
      activeTabId = newTab.id;
      currentSessionId = newTab.conversationId;
    }
  }

  saveTabsToStorage();
  return removed;
}

export function switchConversationTab(tabId) {
  if (!tabId) return null;

  const tab = conversationTabs.find(t => t.id === tabId);
  if (!tab) return null;

  activeTabId = tabId;
  currentSessionId = tab.conversationId;

  saveTabsToStorage();
  return tab;
}

export function updateTabConversation(tabId, conversationId) {
  const tab = conversationTabs.find(t => t.id === tabId);
  if (!tab) return null;

  tab.conversationId = conversationId;
  if (activeTabId === tabId) {
    currentSessionId = conversationId;
  }

  saveTabsToStorage();
  return tab;
}

export function getTabByConversationId(conversationId) {
  return conversationTabs.find(t => t.conversationId === conversationId) ?? null;
}

export function getActiveTab() {
  return conversationTabs.find(t => t.id === activeTabId) ?? null;
}

function saveTabsToStorage() {
  try {
    const data = {
      tabs: conversationTabs,
      activeTabId: activeTabId,
    };
    localStorage.setItem('okc_conversation_tabs', JSON.stringify(data));
  } catch (error) {
    console.error('保存标签页状态失败', error);
  }
}

export function loadTabsFromStorage() {
  try {
    const stored = localStorage.getItem('okc_conversation_tabs');
    if (stored) {
      const data = JSON.parse(stored);
      if (Array.isArray(data.tabs)) {
        conversationTabs = data.tabs.filter(tab =>
          tab && typeof tab.id === 'string' && typeof tab.conversationId === 'string'
        );
      }
      if (data.activeTabId) {
        activeTabId = data.activeTabId;
      }
    }
  } catch (error) {
    console.error('加载标签页状态失败', error);
    conversationTabs = [];
    activeTabId = null;
  }

  // 确保至少有一个标签页
  if (conversationTabs.length === 0) {
    const conversation = getCurrentConversation() ?? createConversation();
    const tab = {
      id: generateId(),
      conversationId: conversation.id,
      createdAt: new Date().toISOString(),
    };
    conversationTabs.push(tab);
    activeTabId = tab.id;
    currentSessionId = conversation.id;
    saveTabsToStorage();
  } else {
    // 验证标签页关联的会话是否存在
    const validTabs = conversationTabs.filter(tab => {
      const conversation = conversations.find(c => c.id === tab.conversationId);
      return conversation !== undefined;
    });

    if (validTabs.length !== conversationTabs.length) {
      conversationTabs = validTabs;
      if (!conversationTabs.find(t => t.id === activeTabId)) {
        activeTabId = conversationTabs[0]?.id ?? null;
      }
      saveTabsToStorage();
    }

    // 设置当前会话ID
    const activeTab = conversationTabs.find(t => t.id === activeTabId);
    if (activeTab) {
      currentSessionId = activeTab.conversationId;
    }
  }

  return conversationTabs;
}

export function getTabTitle(tabId) {
  const tab = conversationTabs.find(t => t.id === tabId);
  if (!tab) return '新对话';

  const conversation = conversations.find(c => c.id === tab.conversationId);
  return conversation?.title ?? DEFAULT_CONVERSATION_TITLE;
}
