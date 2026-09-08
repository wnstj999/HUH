import { bodyAsObject, handler, requireMethod } from '../../server/lib/http.js';
import { getOpggHistoricalRanks } from '../../server/lib/opgg.js';

export default handler(async (req, res) => {
  requireMethod(req, ['POST']);
  const body = bodyAsObject(req);
  res.status(200).json(await getOpggHistoricalRanks(String(body.riotId ?? '')));
});
