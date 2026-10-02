import { expect, it } from 'vitest';
import { requireAccess } from '../server/lib/http';
it('requires authentication even when an old test bypass flag is configured', async () => {
  const previous = process.env.HUH_DISABLE_AUTH;
  process.env.HUH_DISABLE_AUTH = 'true';
  try { await expect(requireAccess({ method: 'GET', headers: {}, query: {} })).rejects.toThrow('로그인'); }
  finally { if (previous === undefined) delete process.env.HUH_DISABLE_AUTH; else process.env.HUH_DISABLE_AUTH = previous; }
});
