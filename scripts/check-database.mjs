import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec('create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);');
 for(const file of ['001_initial_schema.sql','002_player_season_rank_history.sql','003_auth_and_encrypted_settings.sql','004_match_analysis_and_tournaments.sql','005_atomic_match_results.sql','006_atomic_custom_teams.sql','007_tournament_collection.sql']) {
  let sql=readFileSync(`supabase/migrations/${file}`,'utf8').replace(/^\uFEFF/,'');
  // PGlite has built-in gen_random_uuid; the unrelated pgcrypto extension is unavailable here.
  sql=sql.replace('create extension if not exists pgcrypto;','');
  await db.exec(sql);
 }
 const positions=['TOP','JUG','MID','ADC','SUP'];const assignments=[];
 for(let i=0;i<10;i++) {
  const player=await db.query('insert into players(display_name,riot_game_name,riot_tag_line,riot_id,inhouse_tier,inhouse_score,positions,active,participating) values($1,$1,\'QA\',$2,\'B\',8,$3,true,true) returning id',[`SQL QA ${i}`,`SQL QA ${i}#QA`,[positions[i%5]]]);
  assignments.push({playerId:player.rows[0].id,team:i<5?'BLUE':'RED',position:positions[i%5]});
 }
 const created=await db.query('select create_inhouse_match($1,$2::jsonb) id',['SQL QA 경기',JSON.stringify(assignments)]);const id=created.rows[0].id;
 const update=patch=>db.query('select update_inhouse_match($1,$2::jsonb) id',[id,JSON.stringify(patch)]);
 await update({winner_team:'BLUE',status:'COMPLETED',duration_seconds:1800,started_at:'2026-10-01T11:00:00Z',ended_at:'2026-10-01T11:30:00Z'});
 assert.deepEqual((await db.query('select count(*) filter(where win=true)::int wins,count(*) filter(where win=false)::int losses from match_participants')).rows[0],{wins:5,losses:5});
 await update({winner_team:null});
 assert.equal((await db.query('select count(*)::int n from match_participants where win is null')).rows[0].n,10);
 await assert.rejects(()=>update({winner_team:'RED',ended_at:'2026-10-01T10:00:00Z'}));
 assert.equal((await db.query('select winner_team from inhouse_matches where id=$1',[id])).rows[0].winner_team,null);
 await db.exec("create function qa_fail() returns trigger language plpgsql as $$ begin raise exception 'QA participant failure'; end $$; create trigger qa_fail before update on match_participants for each row execute function qa_fail();");
 await assert.rejects(()=>update({winner_team:'RED'}));
 assert.equal((await db.query('select winner_team from inhouse_matches where id=$1',[id])).rows[0].winner_team,null);
 assert.equal((await db.query('select count(*)::int n from match_participants where win is null')).rows[0].n,10);
 const permissions=await db.query("select has_function_privilege('anon','public.update_inhouse_match(uuid,jsonb)','execute') anon,has_function_privilege('authenticated','public.update_inhouse_match(uuid,jsonb)','execute') authenticated,has_function_privilege('service_role','public.update_inhouse_match(uuid,jsonb)','execute') service");
 assert.deepEqual(permissions.rows[0],{anon:false,authenticated:false,service:true});
 const teamInput={name:'팀 원본',members:[{playerId:assignments[0].playerId,riotId:'SQL QA 0#QA',playerName:'QA 선수',position:'TOP'}]};
 const savedTeam=await db.query('select save_inhouse_custom_team(null,$1::jsonb) id',[JSON.stringify(teamInput)]);const teamId=savedTeam.rows[0].id;
 await assert.rejects(()=>db.query('select save_inhouse_custom_team($1,$2::jsonb)',[teamId,JSON.stringify({name:'실패할 수정',members:[{...teamInput.members[0],playerId:'00000000-0000-4000-8000-000000000099'}]})]));
 assert.equal((await db.query('select name from inhouse_custom_teams where id=$1',[teamId])).rows[0].name,'팀 원본');
 assert.equal((await db.query('select count(*)::int n from inhouse_team_members where team_id=$1',[teamId])).rows[0].n,1);
 await assert.rejects(()=>db.query('select save_inhouse_custom_team(null,$1::jsonb)',[JSON.stringify({name:'중복 포지션',members:[teamInput.members[0],teamInput.members[0]]})]));
 assert.equal((await db.query('select count(*)::int n from inhouse_custom_teams')).rows[0].n,1);
 assert.equal((await db.query("select has_function_privilege('anon','public.save_inhouse_custom_team(uuid,jsonb)','execute') allowed")).rows[0].allowed,false);
 await db.exec('drop trigger qa_fail on match_participants;');
 await update({status:'READY'});
 for(let i=0;i<10;i++) await db.query('update players set puuid=$1 where id=$2',[`puuid-${i}`,assignments[i].playerId]);
 const roster=assignments.map((p,i)=>({...p,puuid:`puuid-${i}`}));
 const reserve=()=>db.query('select reserve_tournament_session($1,$2,$3::jsonb,null)',[id,'digest-test',JSON.stringify(roster)]);
 await reserve();await assert.rejects(reserve);
 await assert.rejects(()=>update({winner_team:'RED'}));
 await assert.rejects(()=>db.query('update match_participants set kills=999 where match_id=$1',[id]));
 await db.query('select attach_tournament_code($1,$2,$3)',[id,'QA-CODE',1]);
 await assert.rejects(()=>db.query('select record_tournament_callback($1,$2,$3)',['QA-CODE','forged','KR_123']));
 assert.equal((await db.query('select riot_match_id from tournament_sessions')).rows[0].riot_match_id,null);
 await db.query('select record_tournament_callback($1,$2,$3)',['QA-CODE','digest-test','KR_123']);
 await assert.rejects(()=>db.query('select record_tournament_callback($1,$2,$3)',['QA-CODE','digest-test','KR_999']));
 const result={winner_team:'BLUE',started_at:'2026-10-01T00:00:00Z',ended_at:'2026-10-01T00:30:00Z',duration_seconds:1800,participants:roster.map((p,i)=>({player_id:p.playerId,team:p.team,position:p.position,champion_id:103,champion_name:'Ahri',win:i<5,kills:6,deaths:3,assists:9,cs:190,gold:12000,damage_to_champions:24000,vision_score:20}))};
 const collect=value=>db.query('select import_tournament_result($1,$2,$3::jsonb)',[id,'KR_123',JSON.stringify(value)]);
 await db.exec('create trigger qa_fail before update on match_participants for each row execute function qa_fail();');
 await assert.rejects(()=>collect(result));
 assert.equal((await db.query('select state from tournament_sessions')).rows[0].state,'RECEIVED');
 assert.equal((await db.query('select status from inhouse_matches where id=$1',[id])).rows[0].status,'READY');
 await db.exec('drop trigger qa_fail on match_participants;');
 await collect(result);
 assert.equal((await db.query('select count(*)::int n from match_participants where cs=190 and gold=12000')).rows[0].n,10);
 assert.equal((await db.query('select state from tournament_sessions')).rows[0].state,'COMPLETE');
 await collect({...result,participants:result.participants.map(p=>({...p,cs:999}))});
 await db.query('select record_tournament_callback($1,$2,$3)',['QA-CODE','digest-test','KR_123']);
 assert.equal((await db.query('select count(*)::int n from match_participants where cs=190')).rows[0].n,10);
 assert.equal((await db.query('select state from tournament_sessions')).rows[0].state,'COMPLETE');
 assert.equal((await db.query("select has_function_privilege('anon','public.import_tournament_result(uuid,text,jsonb)','execute') allowed")).rows[0].allowed,false);
 console.log(JSON.stringify({migrationsApplied:7,createdPlayers:10,winnerCounts:true,clearWinner:true,invalidTimeRollback:true,participantFailureRollback:true,serviceOnly:true,teamFailureRollback:true,invalidTeamCreateRollback:true,codeReservationUnique:true,forgedCallbackRejected:true,gameIdImmutable:true,autoImportRollback:true,duplicateCollectionIgnored:true,productionWrites:0}));
}finally{await db.close();}
