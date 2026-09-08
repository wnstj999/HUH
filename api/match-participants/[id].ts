import { assertDb, db } from '../../server/lib/db.js';
import { bodyAsObject, handler, HttpError, requireMethod } from '../../server/lib/http.js';

const FIELD_MAP = {
  championId: 'champion_id', championName: 'champion_name', kills: 'kills', deaths: 'deaths', assists: 'assists', cs: 'cs', gold: 'gold', damageToChampions: 'damage_to_champions', visionScore: 'vision_score',
} as const;

export default handler(async (req, res) => {
  requireMethod(req, ['PATCH']);
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) throw new HttpError(400, 'ID_REQUIRED', '참가 기록 ID가 필요합니다.');
  const body = bodyAsObject(req);
  const patch: Record<string, unknown> = {};
  for (const [inputKey, column] of Object.entries(FIELD_MAP)) {
    if (!(inputKey in body)) continue;
    const value = body[inputKey];
    if (inputKey === 'championName') patch[column] = String(value ?? '').trim() || null;
    else {
      const numberValue = value === '' || value == null ? null : Number(value);
      if (numberValue != null && (!Number.isInteger(numberValue) || numberValue < 0)) throw new HttpError(400, 'INVALID_STATS', '경기 수치는 0 이상의 정수여야 합니다.');
      patch[column] = numberValue;
    }
  }
  if (!Object.keys(patch).length) throw new HttpError(400, 'EMPTY_PATCH', '수정할 기록이 없습니다.');
  const row = assertDb(await db().from('match_participants').update(patch).eq('id', id).select().single());
  res.status(200).json({ participant: row });
});
