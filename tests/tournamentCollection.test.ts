import {describe,it,expect,vi,afterEach} from 'vitest';
import {parseTournamentCallback,tournamentResult,type TournamentRosterEntry} from '../server/tournament/result';
import {RiotTournamentAdapter,tournamentConfiguration} from '../server/tournament/adapter';
import type {RiotMatchDetail} from '../server/lib/riot';
const roles=['TOP','JUG','MID','ADC','SUP'] as const;
const roster:TournamentRosterEntry[]=Array.from({length:10},(_,i)=>({playerId:`player-${i}`,puuid:`puuid-${i}`,team:i<5?'BLUE':'RED',position:roles[i%5]!}));
function detail():RiotMatchDetail {return {metadata:{matchId:'KR_123',participants:roster.map(p=>p.puuid)},info:{gameCreation:100,gameStartTimestamp:Date.parse('2026-10-01T00:00:00Z'),gameDuration:1800,gameMode:'CLASSIC',mapId:11,queueId:0,tournamentCode:'real-code',participants:roster.map((p,i)=>({puuid:p.puuid,teamId:i<5?100:200,championId:103,championName:'Ahri',teamPosition:'',win:i<5,kills:6,deaths:3,assists:9,totalMinionsKilled:180,neutralMinionsKilled:10,goldEarned:12000,totalDamageDealtToChampions:24000,visionScore:20,timePlayed:1800}))}};}
const expected={code:'real-code',riotMatchId:'KR_123',roster};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('Tournament collection verification',()=>{
 it('uses authoritative game start, seconds, CS components and planned roster roles',()=>{
  const result=tournamentResult(detail(),expected);
  expect(result).toMatchObject({winner_team:'BLUE',started_at:'2026-10-01T00:00:00.000Z',ended_at:'2026-10-01T00:30:00.000Z',duration_seconds:1800});
  expect(result.participants).toHaveLength(10);expect(result.participants[0]).toMatchObject({cs:190,kills:6,deaths:3,assists:9,damage_to_champions:24000,position:'TOP'});
 });
 it.each(['code','game','roster','team','missingMetric','winner','duplicate','time'])('rejects %s mismatches before storage',kind=>{
  const d=detail();if(kind==='code')d.info.tournamentCode='other';if(kind==='game')d.metadata.matchId='KR_999';if(kind==='roster')d.info.participants[0]!.puuid='outsider';if(kind==='team')d.info.participants[0]!.teamId=200;if(kind==='missingMetric')d.info.participants[0]!.goldEarned=undefined as unknown as number;if(kind==='winner')d.info.participants[0]!.win=false;if(kind==='duplicate')d.info.participants[0]!.puuid=d.info.participants[1]!.puuid;if(kind==='time')d.info.gameStartTimestamp=NaN;
  expect(()=>tournamentResult(d,expected)).toThrow();
 });
 it('requires KR callback and unpredictable metadata proof',()=>{
  const callback={region:'KR',gameMap:11,gameMode:'CLASSIC',shortCode:'real-code',gameId:123,metaData:JSON.stringify({nonce:'a'.repeat(64)})};
  expect(parseTournamentCallback(callback)).toEqual({code:'real-code',riotMatchId:'KR_123',nonce:'a'.repeat(64)});
  expect(()=>parseTournamentCallback({...callback,region:'NA1'})).toThrow();expect(()=>parseTournamentCallback({...callback,metaData:'{}'})).toThrow();expect(()=>parseTournamentCallback({...callback,gameId:123.5})).toThrow();
 });
 it('keeps secrets in server headers and never retries a failed code POST',async()=>{
  const fetch=vi.fn().mockResolvedValue(new Response('',{status:503}));vi.stubGlobal('fetch',fetch);
  await expect(new RiotTournamentAdapter('test-only-token').createCode({tournamentId:1,metadata:'proof',puuids:roster.map(p=>p.puuid)})).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);
  const [url,request]=fetch.mock.calls[0]!;expect(url).toContain('asia.api.riotgames.com/lol/tournament/v5/codes');expect(request.headers['X-Riot-Token']).toBe('test-only-token');expect(request.body).not.toContain('test-only-token');
 });
 it('requires explicit enablement plus a positive provider id',()=>{vi.stubEnv('TOURNAMENT_API_ENABLED','true');vi.stubEnv('TOURNAMENT_PROVIDER_ID','');expect(tournamentConfiguration().enabled).toBe(false);vi.stubEnv('TOURNAMENT_PROVIDER_ID','123');expect(tournamentConfiguration().enabled).toBe(true);});
});
