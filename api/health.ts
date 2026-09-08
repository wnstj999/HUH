import { db } from '../server/lib/db.js';
import { handler, requireMethod } from '../server/lib/http.js';
import { getRiotKeyStatus } from '../server/lib/settings.js';

export default handler(async (req, res) => {
  requireMethod(req, ['GET']);
  let database = false;
  try { database = !(await db().from('players').select('id', { head: true, count: 'exact' })).error; } catch { database = false; }
  let riotConfigured = Boolean(process.env.RIOT_API_KEY);
  try { riotConfigured = (await getRiotKeyStatus()).configured; } catch { /* retain environment fallback */ }
  res.status(200).json({
    status: database ? 'ok' : 'degraded', backend: true, database,
    riotConfigured, opggEnabled: process.env.OPGG_SCRAPING_ENABLED?.toLowerCase() === 'true',
    tournamentEnabled: process.env.TOURNAMENT_API_ENABLED?.toLowerCase() === 'true', timestamp: new Date().toISOString(),
  });
}, { public: true });
