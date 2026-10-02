import { HttpError } from '../lib/http.js';
import type { RiotMatchDetail } from '../lib/riot.js';
export interface TournamentRosterEntry { playerId:string; puuid:string; team:'BLUE'|'RED'; position:'TOP'|'JUG'|'MID'|'ADC'|'SUP' }
export function parseTournamentCallback(value:Record<string,unknown>) {
 if(value.region!=='KR'||value.gameMap!==11||value.gameMode!=='CLASSIC'||typeof value.shortCode!=='string'||value.shortCode.length>256||!Number.isSafeInteger(value.gameId)||Number(value.gameId)<=0||typeof value.metaData!=='string'||value.metaData.length>1024) throw new HttpError(400,'CALLBACK_INVALID','올바른 KR 내전 종료 알림이 아닙니다.');
 let metadata:unknown;try{metadata=JSON.parse(value.metaData);}catch{throw new HttpError(400,'CALLBACK_INVALID','종료 알림 검증 정보가 올바르지 않습니다.');}
 const m=metadata as Record<string,unknown>|null;
 if(!m||typeof m.nonce!=='string'||! /^[a-f0-9]{64}$/.test(m.nonce)) throw new HttpError(400,'CALLBACK_INVALID','종료 알림 검증 정보가 올바르지 않습니다.');
 return {code:value.shortCode,nonce:m.nonce,riotMatchId:`KR_${value.gameId}`};
}
export function tournamentResult(detail:RiotMatchDetail,expected:{code:string;riotMatchId:string;roster:TournamentRosterEntry[]}) {
 const fail=()=>{throw new HttpError(422,'TOURNAMENT_RESULT_MISMATCH','Riot 경기와 등록된 내전의 코드·참가자·팀을 확인해야 합니다.');};
 const info=detail.info;
 if(detail.metadata.matchId!==expected.riotMatchId||info.tournamentCode!==expected.code||info.mapId!==11||info.gameMode!=='CLASSIC'||!Number.isSafeInteger(info.gameStartTimestamp)||!Number.isSafeInteger(info.gameDuration)||info.gameDuration<=0||!Array.isArray(info.participants)||info.participants.length!==10||expected.roster.length!==10) return fail();
 if(new Set(expected.roster.map(p=>p.puuid)).size!==10||new Set(info.participants.map(p=>p.puuid)).size!==10) return fail();
 const participants=expected.roster.map(entry=>{
  const p=info.participants.find(p=>p.puuid===entry.puuid);
  if(!p||p.teamId!==(entry.team==='BLUE'?100:200)||typeof p.win!=='boolean'||typeof p.championName!=='string'||!p.championName) return fail();
  const metrics=[p.championId,p.kills,p.deaths,p.assists,p.totalMinionsKilled,p.neutralMinionsKilled,p.goldEarned,p.totalDamageDealtToChampions,p.visionScore];
  if(metrics.some(n=>!Number.isSafeInteger(n)||n<0)) return fail();
  return {player_id:entry.playerId,team:entry.team,position:entry.position,champion_id:p.championId,champion_name:p.championName,win:p.win,kills:p.kills,deaths:p.deaths,assists:p.assists,cs:p.totalMinionsKilled+p.neutralMinionsKilled,gold:p.goldEarned,damage_to_champions:p.totalDamageDealtToChampions,vision_score:p.visionScore};
 });
 const winners=participants.filter(p=>p.win);if(winners.length!==5||new Set(winners.map(p=>p.team)).size!==1||participants.filter(p=>!p.win).some(p=>p.team===winners[0]!.team)) return fail();
 const started=new Date(info.gameStartTimestamp!);if(!Number.isFinite(started.getTime())||started.getTime()>Date.now()+60000) return fail();
 return {winner_team:winners[0]!.team,started_at:started.toISOString(),ended_at:new Date(started.getTime()+info.gameDuration*1000).toISOString(),duration_seconds:info.gameDuration,participants};
}
