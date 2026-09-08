import { bodyAsObject, handler, requireMethod } from '../../server/lib/http.js';
import { getSoloRank, resolveRiotKey } from '../../server/lib/riot.js';

export default handler(async (req, res) => {
  requireMethod(req, ['POST']);
  const body = bodyAsObject(req);
  const rank = await getSoloRank(String(body.puuid ?? ''), resolveRiotKey(req.headers['x-riot-api-key']));
  res.status(200).json({ rank });
});
