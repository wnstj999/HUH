import { describe, expect, it } from 'vitest';
import { parseFowRankHistory } from '../server/lib/fow';

describe('parseFowRankHistory', () => {
  it('keeps each season final rank and peak rank with its queue', () => {
    const html = `<div class="tipsy_live" tipsy="[ 솔로랭크 S13 - 2 ]&lt;BR&gt;최종 기록: DIAMOND IV - 47&lt;BR&gt;최고 기록: DIAMOND III - 22&lt;HR&gt;[ 자유랭크 S13 - 2 ]&lt;BR&gt;최종 기록: DIAMOND IV - 0&lt;BR&gt;최고 기록: DIAMOND IV - 84&lt;HR&gt;">S13 - 2: DIAMOND</div>`;
    expect(parseFowRankHistory(html)).toMatchObject({
      solo: [{ season: 'S13 - 2', finalRank: { tier: 'DIAMOND', division: '4', lp: 47 }, peakRank: { tier: 'DIAMOND', division: '3', lp: 22 } }],
      flex: [{ season: 'S13 - 2', finalRank: { tier: 'DIAMOND', division: '4', lp: 0 }, peakRank: { tier: 'DIAMOND', division: '4', lp: 84 } }],
      historicalSolo: { tier: 'DIAMOND', division: '3', lp: 22 },
      historicalFlex: { tier: 'DIAMOND', division: '4', lp: 84 },
    });
  });
});
