import { bodyAsObject, handler, requireMethod } from '../../server/lib/http.js';
import { getSoloRank } from '../../server/lib/riot.js';
import { resolveRiotKey } from '../../server/lib/settings.js';

export default handler(async (req, res) => {
  requireMethod(req, ['POST']);
  const body = bodyAsObject(req);
  const rank = await getSoloRank(String(body.puuid ?? ''), await resolveRiotKey());
  res.status(200).json({ rank });
});
