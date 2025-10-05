import { fetchJson } from './utils.js';

export async function assignWorkspaceBranch({ branch, snapshotId, checkout = true } = {}) {
  if (typeof branch !== 'string' || !branch.trim()) {
    throw new Error('缺少有效的分支名称，无法标记工作区');
  }

  const payload = { branch: branch.trim() };
  if (typeof snapshotId === 'string' && snapshotId.trim()) {
    payload.snapshot_id = snapshotId.trim();
  }
  payload.checkout = Boolean(checkout);

  return fetchJson('/api/session/workspace/branch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function restoreWorkspace({ branch, snapshotId, checkout = true } = {}) {
  const payload = {};
  if (typeof branch === 'string' && branch.trim()) {
    payload.branch = branch.trim();
  }
  if (typeof snapshotId === 'string' && snapshotId.trim()) {
    payload.snapshot_id = snapshotId.trim();
  }

  if (!payload.branch && !payload.snapshot_id) {
    throw new Error('缺少快照或分支信息，无法恢复工作区');
  }

  payload.checkout = Boolean(checkout);

  return fetchJson('/api/session/workspace/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
