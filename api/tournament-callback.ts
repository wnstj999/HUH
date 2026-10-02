import { createHash } from 'node:crypto';
import { db } from '../server/lib/db.js';
import { bodyAsObject, handler, HttpError, requireMethod } from '../server/lib/http.js';
import { parseTournamentCallback } from '../server/tournament/result.js';
import { collectTournamentResult } from '../server/tournament/collector.js';
export default handler(async(req,res)=>{
 requireMethod(req,['POST']);
 const callback=parseTournamentCallback(bodyAsObject(req));
 const result=await db().rpc('record_tournament_callback',{p_code:callback.code,p_digest:createHash('sha256').update(callback.nonce).digest('hex'),p_riot_match_id:callback.riotMatchId});
 if(result.error||typeof result.data!=='string') throw new HttpError(result.error?.code==='28000'?403:409,'CALLBACK_REJECTED','등록된 경기 종료 알림을 확인하지 못했습니다.');
 // Only acknowledge after both verification and transactional storage succeed.
 // Riot retries non-200 callbacks; an authenticated operator can also retry later.
 await collectTournamentResult(result.data);
 res.status(200).json({accepted:true});
},{public:true});
