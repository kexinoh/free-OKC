import {
  DEFAULT_CONVERSATION_TITLE,
  CONVERSATION_TITLE_MAX_LENGTH,
  STORAGE_KEYS,
} from './constants.js';
import { storage } from './storage.js';
import { generateId } from './utils.js';

let conversations = [];
let currentSessionId = null;

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
    state.versions = [
      {
        id: generateId(),
        signature,
        messages: snapshot,
        selections,
        createdAt: new Date().toISOString(),
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
) {
  if (!conversation || !messageId) return;
  const state = ensureBranchState(conversation, messageId);
  if (!state) return;

  const timestamp = new Date().toISOString();
  const previousSnapshot = cloneMessages(previousMessages);
  const previousSignature = computeMessageSignature(previousSnapshot);
  const nextSnapshot = cloneMessages(conversation.messages);
  const nextSignature = computeMessageSignature(nextSnapshot);

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
    });
    previousIndex = state.versions.length - 1;
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
    });
    nextIndex = state.versions.length - 1;
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
  }
}

export function syncActiveBranchSnapshots(conversation) {
  if (!conversation?.branches || typeof conversation.branches !== 'object') return;
  const activeSelections = captureBranchSelections(conversation.branches);
  const snapshot = cloneMessages(conversation.messages);
  const signature = computeMessageSignature(snapshot);
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
              return {
                id: typeof version.id === 'string' && version.id ? version.id : generateId(),
                messages,
                signature,
                selections,
                createdAt,
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

export function loadConversationsFromStorage() {
  const raw = storage.getItem(STORAGE_KEYS.conversations);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        conversations = parsed
          .map((entry) => normalizeConversation(entry))
          .filter((entry) => entry !== null);
        conversations.forEach((conversation) => {
          syncActiveBranchSnapshots(conversation);
        });
      }
    } catch (error) {
      conversations = [];
    }
  }

  const storedCurrent = storage.getItem(STORAGE_KEYS.current);
  if (typeof storedCurrent === 'string' && storedCurrent) {
    currentSessionId = storedCurrent;
  }

  if (!getCurrentConversation() && conversations.length > 0) {
    currentSessionId = conversations[0].id;
  }
}

export function saveConversationsToStorage() {
  storage.setItem(STORAGE_KEYS.conversations, JSON.stringify(conversations));
  if (currentSessionId) {
    storage.setItem(STORAGE_KEYS.current, currentSessionId);
  } else {
    storage.removeItem(STORAGE_KEYS.current);
  }
}

export function getCurrentConversation() {
  return conversations.find((conversation) => conversation.id === currentSessionId) ?? null;
}

export function ensureCurrentConversation() {
  if (getCurrentConversation()) return;
  if (conversations.length === 0) {
    createConversation();
    return;
  }
  currentSessionId = conversations[0].id;
  saveConversationsToStorage();
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
  };
  conversations.unshift(conversation);
  currentSessionId = conversation.id;
  saveConversationsToStorage();
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
  saveConversationsToStorage();
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
  saveConversationsToStorage();
  return conversation;
}
