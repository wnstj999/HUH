import { bodyAsObject, handler, HttpError, requireMethod } from '../../server/lib/http.js';
import { getRiotKeyStatus, saveRiotKey } from '../../server/lib/settings.js';
import { testRiotConnection } from '../../server/lib/riot.js';

export default handler(async (req, res) => {
  requireMethod(req, ['GET', 'PUT']);
  if (req.method === 'GET') {
    res.status(200).json(await getRiotKeyStatus());
    return;
  }
  const key = String(bodyAsObject(req).riotApiKey ?? '').trim();
  if (!/^RGAPI-[A-Za-z0-9_-]+$/.test(key)) throw new HttpError(400, 'RIOT_KEY_INVALID', '올바른 Riot API Key를 입력하세요.');
  await testRiotConnection(key);
  const updatedAt = await saveRiotKey(key, req.authUser?.id ?? null);
  res.status(200).json({ configured: true, source: 'database', updatedAt });
});
