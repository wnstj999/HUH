import { describe, expect, it } from 'vitest';
import { parseRiotId } from '../src/lib/riotId';

describe('parseRiotId', () => {
  it('splits only on the final hash and preserves spaces', () => {
    expect(parseRiotId(' 1USD 1533KRW#0620 ')).toEqual({ gameName: '1USD 1533KRW', tagLine: '0620', riotId: '1USD 1533KRW#0620' });
  });
});
