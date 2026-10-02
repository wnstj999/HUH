import { createHash, randomBytes } from 'node:crypto';
import { db, assertDb } from '../server/lib/db.js';
import { bodyAsObject, handler, HttpError, requireMethod } from '../server/lib/http.js';
import { resolveRiotKey } from '../server/lib/settings.js';
import { RiotTournamentAdapter, tournamentConfiguration } from '../server/tournament/adapter.js';
import { collectTournamentResult } from '../server/tournament/collector.js';

export default handler(async(req,res)=>{
 requireMethod(req,['GET','POST']);const client=db();
 const matchId=req.method==='GET'?req.query.matchId:bodyAsObject(req).matchId;
 if(typeof matchId!=='string'||! /^[a-f0-9-]{36}$/i.test(matchId)) throw new HttpError(400,'MATCH_ID_INVALID','경기를 선택하세요.');
 if(req.method==='GET') {
  const session=await client.from('tournament_sessions').select('match_id,code,state,riot_match_id,attempts,last_error_code,updated_at').eq('match_id',matchId).maybeSingle();
  if(session.error) throw new HttpError(503,'SCHEMA_NOT_READY','자동 수집 DB 연결이 준비되지 않았습니다.');
  res.status(200).json({session:session.data});return;
 }
 const body=bodyAsObject(req);
 if(body.action==='retry'){await collectTournamentResult(matchId);res.status(200).json({collected:true});return;}
 if(body.consentConfirmed!==true) throw new HttpError(400,'CONSENT_REQUIRED','참가자 10명의 내전 기록 공유 동의를 먼저 확인하세요.');
 const configuration=tournamentConfiguration();
 if(!configuration.enabled) throw new HttpError(503,'TOURNAMENT_NOT_READY','Riot Tournament 접근 승인과 운영 연결을 준비 중입니다.');
 const key=await resolveRiotKey();
 const rows=assertDb(await client.from('match_participants').select('player_id,team,position,players(puuid)').eq('match_id',matchId));
 const roster=rows.map(row=>{const player=row.players as unknown as {puuid:string|null};return {playerId:row.player_id,team:row.team,position:row.position,puuid:player?.puuid};});
 if(roster.length!==10||roster.some(p=>!p.puuid)||new Set(roster.map(p=>p.puuid)).size!==10) throw new HttpError(400,'PUUID_REQUIRED','참가자 10명의 Riot 계정 연결을 먼저 갱신하세요.');
 const nonce=randomBytes(32).toString('hex');
 const reserved=await client.rpc('reserve_tournament_session',{p_match_id:matchId,p_digest:createHash('sha256').update(nonce).digest('hex'),p_roster:roster,p_user_id:req.authUser?.id??null});
 if(reserved.error) throw new HttpError(reserved.error.code==='PGRST202'?503:409,'CODE_RESERVATION_FAILED','이미 코드 생성 요청이 있거나 내전 준비 상태가 아닙니다. 운영 연결을 확인하세요.');
 const adapter=new RiotTournamentAdapter(key);
 try {
  const tournamentId=await adapter.createTournament(configuration.providerId,`HUH ${matchId}`);
  const code=await adapter.createCode({tournamentId,metadata:JSON.stringify({nonce}),puuids:roster.map(p=>String(p.puuid))});
  const attached=await client.rpc('attach_tournament_code',{p_match_id:matchId,p_code:code,p_tournament_id:tournamentId});
  if(attached.error) throw new HttpError(503,'CODE_SAVE_FAILED','코드 발급 후 DB 저장을 확인하지 못했습니다. 운영자가 복구해야 합니다.');
  res.status(201).json({code});
 }catch(error){await client.from('tournament_sessions').update({state:'UNKNOWN',last_error_code:error instanceof HttpError?error.code:'CODE_REQUEST_UNKNOWN',updated_at:new Date().toISOString()}).eq('match_id',matchId).eq('state','CREATING');throw error;}
});
