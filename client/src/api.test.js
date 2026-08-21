import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body) {
  return { ok: true, json: async () => body };
}

describe('api account selection', () => {
  it('loads role-filtered accounts without a protected account header', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal('fetch', fetch);

    await api.accounts('parent');

    expect(fetch).toHaveBeenCalledWith('/api/accounts?role=parent', expect.objectContaining({
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('sends the selected persisted account id to protected parent requests', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ students: [] }));
    vi.stubGlobal('fetch', fetch);

    await api.parent.dashboard('parent-local-id');

    expect(fetch).toHaveBeenCalledWith('/api/parent/dashboard', expect.objectContaining({
      headers: {
        'Content-Type': 'application/json',
        'x-demo-user': 'parent-local-id',
      },
    }));
  });
});
