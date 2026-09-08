import { describe, expect, it } from 'vitest';
import { getOpggHistoricalRanks } from '../server/lib/opgg';

const live = process.env.OPGG_LIVE_TEST === 'true' ? it : it.skip;

describe('OP.GG live adapter', () => {
  live('fetches and parses queue-bound public season records including Top tier', async () => {
    process.env.OPGG_SCRAPING_ENABLED = 'true';
    const result = await getOpggHistoricalRanks('지건킹보고배움#2026');
    expect(result.sourceUrl).toContain('op.gg/lol/summoners/kr/');
    expect(result.historicalSolo).toMatchObject({
      tier: 'DIAMOND',
      division: '2',
      lp: 39,
    });
  }, 20_000);
});
