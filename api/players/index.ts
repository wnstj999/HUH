import { assertDb, db } from '../../server/lib/db.js';
import { handler, bodyAsObject, requireMethod } from '../../server/lib/http.js';
import { mapPlayer } from '../../server/lib/mappers.js';
import { parsePlayerInput, toPlayerRow } from '../../server/lib/player-input.js';

export default handler(async (req, res) => {
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
