import { bodyAsObject, handler, requireMethod } from '../../server/lib/http.js';
import { getRiotAccount, getSoloRank, testRiotConnection } from '../../server/lib/riot.js';
import { resolveRiotKey } from '../../server/lib/settings.js';

function actionName(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default handler(async (req, res) => {
  const action = actionName(req.query.action);
  requireMethod(req, ['POST']);
  const key = await resolveRiotKey();

  if (action === 'test') {
    await testRiotConnection(key);
    res.status(200).json({ status: 'connected', message: 'Riot API에 연결되었습니다.' });
    return;
  }

  const body = bodyAsObject(req);
  if (action === 'account') {
    const account = await getRiotAccount(String(body.riotId ?? ''), key);
    res.status(200).json({ account });
    return;
  }
  if (action === 'rank') {
    const rank = await getSoloRank(String(body.puuid ?? ''), key);
    res.status(200).json({ rank });
    return;
  }

  res.status(404).json({ error: { code: 'RIOT_ROUTE_NOT_FOUND', message: 'Riot API 경로를 찾을 수 없습니다.' } });
});
