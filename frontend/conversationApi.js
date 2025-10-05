import { fetchJson } from './utils.js';

export async function fetchConversations() {
  return fetchJson('/api/conversations');
}

export async function updateConversationOnServer(conversation) {
  if (!conversation || typeof conversation !== 'object' || !conversation.id) {
    throw new Error('缺少会话 ID，无法保存');
  }
  return fetchJson(`/api/conversations/${encodeURIComponent(conversation.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(conversation),
  });
}

export async function deleteConversationOnServer(conversationId) {
  if (!conversationId) {
    throw new Error('缺少会话 ID，无法删除');
  }
  return fetchJson(`/api/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
  });
}
