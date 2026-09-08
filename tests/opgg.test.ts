import { describe, expect, it } from 'vitest';
import { parseOpggHistoricalRanks } from '../server/lib/opgg';

function flight(payload: string): string {
  return `<script>self.__next_f.push(${JSON.stringify([1, payload])})</script>`;
}

describe('parseOpggHistoricalRanks', () => {
  it('keeps queue records together and never combines unrelated tier, LP, or season text', () => {
    const solo = [{
      season: 'S2024 S2',
      rank_entries: {
        high_rank_info: { value: 'DIAMOND', division: 1, lp: null },
        rank_info: { value: 'DIAMOND', division: 2, lp: '43' },
      },
    }];
    const flex = [{
      season: 'S2025',
      rank_entries: {
        high_rank_info: { value: 'EMERALD', division: 2, lp: '12' },
        rank_info: { value: 'EMERALD', division: 3, lp: '0' },
      },
    }];
    const html = [
      '<html><body><div>MASTER 89LP (S2026)</div>',
      flight(`7:["$","component",null,{"data":${JSON.stringify(solo)},"gameType":{"game_type":"SOLORANKED","game_translate":"Ranked Solo/Duo"}}]`),
      flight(`8:["$","component",null,{"data":${JSON.stringify(flex)},"gameType":{"game_type":"FLEXRANKED","game_translate":"Ranked Flex"}}]`),
      '</body></html>',
    ].join('');
    expect(parseOpggHistoricalRanks(html)).toEqual({
      historicalSolo: { tier: 'DIAMOND', division: '1', lp: null, season: 'S2024 S2' },
      historicalFlex: { tier: 'EMERALD', division: '2', lp: 12, season: 'S2025' },
    });
  });

  it('keeps a verified zero LP value', () => {
    const records = [{ season: 'S2023', rank_entries: { rank_info: { value: 'GOLD', division: 1, lp: '0' } } }];
    const html = flight(`1:{"data":${JSON.stringify(records)},"gameType":{"game_type":"SOLORANKED"}}`);
    expect(parseOpggHistoricalRanks(html).historicalSolo?.lp).toBe(0);
  });
});
