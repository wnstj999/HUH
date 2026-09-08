import { bodyAsObject, handler, requireMethod } from '../../server/lib/http.js';
import { getRiotAccount } from '../../server/lib/riot.js';
import { resolveRiotKey } from '../../server/lib/settings.js';

export default handler(async (req, res) => {
  requireMethod(req, ['POST']);
  const body = bodyAsObject(req);
  const account = await getRiotAccount(String(body.riotId ?? ''), await resolveRiotKey());
  res.status(200).json({ account });
});
