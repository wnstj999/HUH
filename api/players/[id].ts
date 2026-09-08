import { assertDb, db } from '../../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../../server/lib/http.js';
import { mapPlayer } from '../../server/lib/mappers.js';
import { parsePlayerInput, toPlayerRow } from '../../server/lib/player-input.js';

export default handler(async (req, res) => {
  requireMethod(req, ['PATCH', 'DELETE']);
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  if (!id) throw new HttpError(400, 'ID_REQUIRED', '플레이어 ID가 필요합니다.');
  const patch = req.method === 'DELETE' ? { active: false, participating: false, updated_at: new Date().toISOString() } : toPlayerRow(parsePlayerInput(bodyAsObject(req), true));
  const row = assertDb(await db().from('players').update(patch).eq('id', id).select().single());
  res.status(200).json({ player: mapPlayer(row) });
});
