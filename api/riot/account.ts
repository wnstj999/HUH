import { bodyAsObject, handler, requireMethod } from '../../server/lib/http.js';
import { getRiotAccount, resolveRiotKey } from '../../server/lib/riot.js';

export default handler(async (req, res) => {
  requireMethod(req, ['POST']);
  const body = bodyAsObject(req);
  const account = await getRiotAccount(String(body.riotId ?? ''), resolveRiotKey(req.headers['x-riot-api-key']));
  res.status(200).json({ account });
});
