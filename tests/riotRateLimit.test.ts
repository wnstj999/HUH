import { afterEach, expect, it, vi } from 'vitest';
import { getMatchIds } from '../server/lib/riot';

afterEach(() => vi.unstubAllGlobals());

it('긴 Retry-After를 5초로 잘라 조기 재요청하지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
  vi.stubGlobal('fetch', fetch);
  await expect(getMatchIds('test-puuid', 'test-key', { count: 20 })).rejects.toMatchObject({ status: 429, code: 'RIOT_RATE_LIMIT' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
