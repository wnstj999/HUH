import { assertDb, db } from '../server/lib/db.js';
import { handler, bodyAsObject, HttpError, requireMethod } from '../server/lib/http.js';
import { parseRiotId } from '../src/lib/riotId.js';
const SELECT = '*, members:inhouse_team_members(*, player:players(id,display_name,inhouse_tier,inhouse_score,current_solo_tier,current_solo_division,current_solo_lp,puuid))';
export default handler(async (req,res) => {
  const client = db();
  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  requireMethod(req,id ? ['GET','PATCH','PUT','DELETE'] : ['GET','POST']);
  if (req.method === 'GET') {
    if (id) res.status(200).json({team:assertDb(await client.from('inhouse_custom_teams').select(SELECT).eq('id',id).single())});
    else res.status(200).json({teams:assertDb(await client.from('inhouse_custom_teams').select(SELECT).order('created_at',{ascending:false}))});
    return;
  }
  if (req.method === 'DELETE') {
    assertDb(await client.from('inhouse_custom_teams').delete().eq('id',id!).select('id').single());
    res.status(200).json({success:true,id}); return;
  }
  const input = bodyAsObject(req);
  if ('members' in input) {
    if (!Array.isArray(input.members)) throw new HttpError(400,'INVALID_MEMBERS','팀원 목록이 필요합니다.');
    input.members = input.members.map(member => {
      if (!member || typeof member !== 'object') throw new HttpError(400,'INVALID_MEMBERS','올바른 팀원 정보를 입력하세요.');
      const value = member as Record<string,unknown>;
      return {...value,riotId:parseRiotId(String(value.riotId ?? '')).riotId};
    });
  }
  const result = await client.rpc('save_inhouse_custom_team',{p_team_id:id ?? null,p_input:input});
  if (result.error?.code === 'PGRST202') throw new HttpError(503,'SCHEMA_NOT_READY','서버의 팀 저장 기능 연결이 준비되지 않았습니다.');
  if (result.error?.code === 'P0002') throw new HttpError(404,'NOT_FOUND','팀을 찾을 수 없습니다.');
  if (['22023','23503','22P02'].includes(result.error?.code ?? '')) throw new HttpError(400,'INVALID_MEMBERS','팀 이름과 팀원·포지션 구성을 확인하세요.');
  const teamId=assertDb(result);
  const team=assertDb(await client.from('inhouse_custom_teams').select(SELECT).eq('id',teamId).single());
  res.status(id?200:201).json({team});
});
