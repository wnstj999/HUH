import { handler, requireMethod } from '../../server/lib/http.js';
import { resolveRiotKey, testRiotConnection } from '../../server/lib/riot.js';

export default handler(async (req, res) => {
  requireMethod(req, ['POST']);
  await testRiotConnection(resolveRiotKey(req.headers['x-riot-api-key']));
  res.status(200).json({ status: 'connected', message: 'Riot API에 연결되었습니다.' });
});
