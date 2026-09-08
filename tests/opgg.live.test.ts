import { describe, expect, it } from 'vitest';
import { getOpggHistoricalRanks } from '../server/lib/opgg';

const live = process.env.OPGG_LIVE_TEST === 'true' ? it : it.skip;

describe('OP.GG live adapter', () => {
  live('fetches and parses queue-bound public season records', async () => {
    process.env.OPGG_SCRAPING_ENABLED = 'true';
    const result = await getOpggHistoricalRanks('준 서#1209');
    expect(result.sourceUrl).toContain('op.gg/lol/summoners/kr/');
    expect(result.historicalSolo || result.historicalFlex).not.toBeNull();
  }, 20_000);
});
