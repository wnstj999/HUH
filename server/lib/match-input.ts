import { HttpError } from './http.js';
export function parseMatchPatch(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if ('status' in body) {
    if (!['READY','IN_PROGRESS','COMPLETED','CANCELLED'].includes(String(body.status))) throw new HttpError(400,'INVALID_STATUS','올바른 경기 상태를 선택하세요.');
    patch.status = body.status;
  }
  if ('winnerTeam' in body) {
    const winner = body.winnerTeam || null;
    if (winner !== null && winner !== 'BLUE' && winner !== 'RED') throw new HttpError(400,'INVALID_WINNER','승리팀은 BLUE 또는 RED여야 합니다.');
    patch.winner_team = winner;
  }
  for (const [key,column] of [['startedAt','started_at'],['endedAt','ended_at']] as const) {
    if (!(key in body)) continue;
    const value = body[key];
    if (!value) patch[column] = null;
    else if (typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))) patch[column] = new Date(value).toISOString();
    else throw new HttpError(400,'INVALID_DATE','경기 날짜에는 시간대가 포함된 날짜가 필요합니다.');
  }
  if ('durationSeconds' in body) {
    const value = body.durationSeconds;
    if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 0)) throw new HttpError(400,'INVALID_DURATION','경기 시간은 0 이상의 정수(초)여야 합니다.');
    patch.duration_seconds = value;
  }
  if (!Object.keys(patch).length) throw new HttpError(400,'EMPTY_PATCH','수정할 경기 정보가 없습니다.');
  return patch;
}
