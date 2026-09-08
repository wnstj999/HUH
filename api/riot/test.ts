import { handler, requireMethod } from '../../server/lib/http.js';
import { testRiotConnection } from '../../server/lib/riot.js';
import { resolveRiotKey } from '../../server/lib/settings.js';

export default handler(async (req, res) => {
  requireMethod(req, ['POST']);
  await testRiotConnection(await resolveRiotKey());
  res.status(200).json({ status: 'connected', message: 'Riot API에 연결되었습니다.' });
});
