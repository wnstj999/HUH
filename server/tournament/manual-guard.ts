import { db } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
export async function requireManualMatch(matchId:string){
 const session=await db().from('tournament_sessions').select('match_id').eq('match_id',matchId).maybeSingle();
 if(session.error&& !['42P01','PGRST205'].includes(session.error.code)) throw new HttpError(503,'COLLECTION_STATE_UNAVAILABLE','자동 수집 상태를 확인하지 못해 수동 수정을 중단했습니다.');
 if(session.data) throw new HttpError(409,'AUTOMATIC_MATCH_LOCKED','자동 수집을 준비한 경기는 수동으로 수정할 수 없습니다. 수집 상태를 확인하세요.');
}
