import { TIER_SCORES, type InhouseTier, type PlayerInput, type Position } from '../../src/types.js';
import { parseRiotId } from '../../src/lib/riotId.js';
import { HttpError } from './http.js';

const POSITIONS: Position[] = ['TOP', 'JUG', 'MID', 'ADC', 'SUP'];

export function parsePlayerInput(body: Record<string, unknown>, partial = false): Partial<PlayerInput> & { riotGameName?: string; riotTagLine?: string; riotId?: string; inhouseScore?: number } {
  const output: Partial<PlayerInput> & { riotGameName?: string; riotTagLine?: string; riotId?: string; inhouseScore?: number } = {};
  if (!partial || 'displayName' in body) {
    const value = String(body.displayName ?? '').trim();
    if (!value) throw new HttpError(400, 'NAME_REQUIRED', '이름을 입력하세요.');
    output.displayName = value;
  }
  if (!partial || 'riotId' in body) {
    const parsed = parseRiotId(String(body.riotId ?? ''));
    output.riotGameName = parsed.gameName; output.riotTagLine = parsed.tagLine; output.riotId = parsed.riotId;
  }
  if (!partial || 'inhouseTier' in body) {
    const tier = String(body.inhouseTier ?? '').toUpperCase() as InhouseTier;
    if (!(tier in TIER_SCORES)) throw new HttpError(400, 'INVALID_TIER', '올바른 내전 티어를 선택하세요.');
    output.inhouseTier = tier; output.inhouseScore = TIER_SCORES[tier];
  }
  if (!partial || 'positions' in body) {
    const positions = Array.isArray(body.positions) ? [...new Set(body.positions.map(String))] : [];
    if (!positions.length || positions.some((position) => !POSITIONS.includes(position as Position))) throw new HttpError(400, 'INVALID_POSITIONS', '하나 이상의 올바른 포지션을 선택하세요.');
    output.positions = positions as Position[];
  }
  if (!partial || 'participating' in body) output.participating = Boolean(body.participating);
  if (!partial || 'active' in body) output.active = body.active !== false;
  if (!partial || 'note' in body) output.note = String(body.note ?? '').trim().slice(0, 1_000);
  return output;
}

export function toPlayerRow(input: ReturnType<typeof parsePlayerInput>): Record<string, unknown> {
  return {
    ...(input.displayName !== undefined && { display_name: input.displayName }),
    ...(input.riotGameName !== undefined && { riot_game_name: input.riotGameName }),
    ...(input.riotTagLine !== undefined && { riot_tag_line: input.riotTagLine }),
    ...(input.riotId !== undefined && { riot_id: input.riotId }),
    ...(input.inhouseTier !== undefined && { inhouse_tier: input.inhouseTier }),
    ...(input.inhouseScore !== undefined && { inhouse_score: input.inhouseScore }),
    ...(input.positions !== undefined && { positions: input.positions }),
    ...(input.participating !== undefined && { participating: input.participating }),
    ...(input.active !== undefined && { active: input.active }),
    ...(input.note !== undefined && { note: input.note }),
    updated_at: new Date().toISOString(),
  };
}
