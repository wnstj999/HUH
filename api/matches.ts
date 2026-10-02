import { requireManualMatch } from '../server/tournament/manual-guard.js';
import { parseMatchPatch } from '../server/lib/match-input.js';
import { assertDb, db } from '../server/lib/db.js';
import { bodyAsObject, handler, HttpError, requireMethod } from '../server/lib/http.js';
import { mapMatch } from '../server/lib/mappers.js';

const MATCH_SELECT = '*, inhouse_events(id,name), match_participants(*, players(id,display_name,inhouse_tier,inhouse_score))';

export default handler(async (req, res) => {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  // 1. 단일 경기 ID가 지정된 경우 ([id].ts 로직)
  if (id) {
    requireMethod(req, ['PATCH']);
    await requireManualMatch(id);
    const body = bodyAsObject(req);
    const patch = parseMatchPatch(body);
    const client = db();
    const updated = await client.rpc('update_inhouse_match', { p_match_id: id, p_patch: patch });
    if (updated.error?.code === 'PGRST202') throw new HttpError(503, 'SCHEMA_NOT_READY', '서버의 경기 저장 기능 연결이 준비되지 않았습니다.');
    if (updated.error?.code === 'P0002') throw new HttpError(404, 'NOT_FOUND', '경기를 찾을 수 없습니다.');
    if (updated.error?.code === '22023') throw new HttpError(400, 'INVALID_MATCH', '경기 상태·시간·승리팀을 확인하세요.');
    assertDb(updated);
    const row = assertDb(await client.from('inhouse_matches').select(MATCH_SELECT).eq('id', id).single());
    res.status(200).json({ match: mapMatch(row) });
    return;
  }

  // 2. 경기 ID가 없는 경우 (index.ts 로직)
  requireMethod(req, ['GET', 'POST']);
  const client = db();

  if (req.method === 'GET') {
    const rows = assertDb(await client.from('inhouse_matches').select(MATCH_SELECT).order('created_at', { ascending: false }));
    res.status(200).json({ matches: rows.map(mapMatch) });
    return;
  }

  const body = bodyAsObject(req);
  const eventName = String(body.eventName ?? '').trim();
  const assignments = Array.isArray(body.assignments) ? body.assignments : [];
  if (!eventName) throw new HttpError(400, 'EVENT_NAME_REQUIRED', '내전 이름을 입력하세요.');

  const matchId = assertDb(await client.rpc('create_inhouse_match', { p_event_name: eventName, p_assignments: assignments }));
  const row = assertDb(await client.from('inhouse_matches').select(MATCH_SELECT).eq('id', matchId).single());
  res.status(201).json({ match: mapMatch(row) });
});
