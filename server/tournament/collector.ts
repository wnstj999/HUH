import { db, assertDb } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import { getMatchDetail } from '../lib/riot.js';
import { resolveRiotKey } from '../lib/settings.js';
import { tournamentResult, type TournamentRosterEntry } from './result.js';
export async function collectTournamentResult(matchId:string) {
 const client=db();
 const session=assertDb(await client.from('tournament_sessions').select('code,roster,riot_match_id,state,attempts').eq('match_id',matchId).single());
 if(session.state==='COMPLETE') return;
 if(!session.riot_match_id||!session.code) throw new HttpError(409,'RESULT_NOT_RECEIVED','아직 경기 종료 알림을 받지 않았습니다.');
 try {
  const detail=await getMatchDetail(String(session.riot_match_id),await resolveRiotKey(),false);
  const result=tournamentResult(detail,{code:String(session.code),riotMatchId:String(session.riot_match_id),roster:session.roster as TournamentRosterEntry[]});
  const saved=await client.rpc('import_tournament_result',{p_match_id:matchId,p_riot_match_id:session.riot_match_id,p_result:result});
  if(saved.error) throw new HttpError(503,'RESULT_SAVE_FAILED','자동 결과 저장에 실패했습니다. 다시 수집하세요.');
 }catch(error){
  // Never overwrite COMPLETE if two callback/retry requests overlap.
  await client.from('tournament_sessions').update({state:'RETRY',attempts:Number(session.attempts)+1,last_error_code:error instanceof HttpError?error.code:'COLLECTION_FAILED',updated_at:new Date().toISOString()}).eq('match_id',matchId).neq('state','COMPLETE');
  throw error;
 }
}
