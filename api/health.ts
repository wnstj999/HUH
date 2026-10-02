import { tournamentConfiguration } from '../server/tournament/adapter.js';
import { db } from '../server/lib/db.js';
import { handler, requireMethod } from '../server/lib/http.js';
import { getRiotKeyStatus } from '../server/lib/settings.js';

export default handler(async (req, res) => {
  requireMethod(req, ['GET']);
  let database = false; let collectionSchema = false;
  let databaseIssue: 'NOT_CONFIGURED' | 'SCHEMA_MISSING' | 'CONNECTION_FAILED' | null = null;
  let customTeams = false; let tournaments = false;
  try {
    const client = db();
    const tables = ['players','inhouse_custom_teams','inhouse_team_members','tournaments','tournament_matches'];
    const results = await Promise.all(tables.map(table => client.from(table).select('id', { head: true, count: 'exact' })));
    database = !results[0]?.error;
    if (!database) databaseIssue = ['PGRST205','42P01'].includes(results[0]?.error?.code ?? '') ? 'SCHEMA_MISSING' : 'CONNECTION_FAILED';
    customTeams = !results[1]?.error && !results[2]?.error;
    tournaments = !results[3]?.error && !results[4]?.error;
    collectionSchema = !(await client.from('tournament_sessions').select('match_id',{head:true})).error;
  } catch { databaseIssue = process.env.SUPABASE_URL || process.env.SUPABASE_URL_2 ? 'CONNECTION_FAILED' : 'NOT_CONFIGURED'; }
  let riotConfigured = Boolean(process.env.RIOT_API_KEY);
  try { riotConfigured = (await getRiotKeyStatus()).configured; } catch { /* Configuration only; not a successful Riot request. */ }
  res.status(200).json({ version: 'huh-operations-v3', status: database ? 'ok' : 'degraded', backend: true, database, databaseIssue, storageCapabilities: { customTeams, tournaments }, riotConfigured, opggEnabled: process.env.OPGG_SCRAPING_ENABLED?.toLowerCase() === 'true', tournamentEnabled: collectionSchema && riotConfigured && tournamentConfiguration().enabled, timestamp: new Date().toISOString() });
}, { public: true });
