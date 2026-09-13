import { assertDb, db } from '../server/lib/db.js';
import { handler, bodyAsObject, requireMethod } from '../server/lib/http.js';
import { mapPlayer } from '../server/lib/mappers.js';
import { parsePlayerInput, toPlayerRow } from '../server/lib/player-input.js';

export default handler(async (req, res) => {
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  // 1. 단일 플레이어 ID가 지정된 경우 ([id].ts 로직)
  if (id) {
    requireMethod(req, ['PATCH', 'DELETE']);
    const patch = req.method === 'DELETE'
      ? { active: false, participating: false, updated_at: new Date().toISOString() }
      : toPlayerRow(parsePlayerInput(bodyAsObject(req), true));
    const row = assertDb(await db().from('players').update(patch).eq('id', id).select().single());
    res.status(200).json({ player: mapPlayer(row) });
    return;
  }

  // 2. 플레이어 ID가 없는 경우 (index.ts 로직)
  requireMethod(req, ['GET', 'POST']);
  if (req.method === 'GET') {
    const rows = assertDb(await db().from('players').select('*').order('active', { ascending: false }).order('display_name'));
    res.status(200).json({ players: rows.map(mapPlayer) });
    return;
  }

  const input = parsePlayerInput(bodyAsObject(req));
  const row = assertDb(await db().from('players').insert(toPlayerRow(input)).select().single());
  res.status(201).json({ player: mapPlayer(row) });
});
