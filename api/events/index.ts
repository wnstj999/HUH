import { assertDb, db } from '../../server/lib/db.js';
import { bodyAsObject, handler, HttpError, requireMethod } from '../../server/lib/http.js';
import { mapEvent } from '../../server/lib/mappers.js';

export default handler(async (req, res) => {
  requireMethod(req, ['GET', 'POST']);
  const client = db();
  if (req.method === 'GET') {
    const rows = assertDb(await client.from('inhouse_events').select('*').order('created_at', { ascending: false }));
    res.status(200).json({ events: rows.map(mapEvent) });
    return;
  }
  const body = bodyAsObject(req);
  const name = String(body.name ?? '').trim();
  const playerIds = Array.isArray(body.playerIds) ? body.playerIds.map(String) : [];
  if (!name) throw new HttpError(400, 'EVENT_NAME_REQUIRED', '내전 이름을 입력하세요.');
  const eventId = assertDb(await client.rpc('create_inhouse_event', { p_name: name, p_player_ids: playerIds }));
  const row = assertDb(await client.from('inhouse_events').select('*').eq('id', eventId).single());
  res.status(201).json({ event: mapEvent(row) });
});
