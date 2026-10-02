import {describe,it,expect} from 'vitest';
import {readdirSync,readFileSync} from 'node:fs';
import matchesEndpoint from '../api/matches';
import tournamentsEndpoint from '../api/tournaments';
import type {VercelRequest,VercelResponse} from '../server/lib/http';
class ResponseMock implements VercelResponse {code=0;body:unknown;setHeader(){return this;}status(code:number){this.code=code;return this;}json(body:unknown){this.body=body;}end(){}}
const request=(action?:string):VercelRequest=>({method:'POST',headers:{},query:action?{action}:{},body:{}});
describe('Vercel deployment boundaries',()=>{
 it('keeps the existing eleven function entries',()=>{
  const entries:string[]=[];function walk(dir:string){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=`${dir}/${entry.name}`;if(entry.isDirectory())walk(path);else if(path.endsWith('.ts'))entries.push(path);}}walk('api');expect(entries).toHaveLength(11);
  const rewrites=JSON.parse(readFileSync('vercel.json','utf8')).rewrites;expect(rewrites).toContainEqual({source:'/api/tournament-session',destination:'/api/matches?action=tournament-session'});expect(rewrites).toContainEqual({source:'/api/tournament-callback',destination:'/api/tournaments?action=tournament-callback'});
 });
 it('requires login on both regular and code-creation routes',async()=>{for(const [endpoint,action] of [[matchesEndpoint,undefined],[matchesEndpoint,'tournament-session'],[tournamentsEndpoint,undefined]] as const){const res=new ResponseMock();await endpoint(request(action),res);expect(res.code).toBe(401);}});
 it('exposes only the validated callback route without operator login',async()=>{const res=new ResponseMock();await tournamentsEndpoint(request('tournament-callback'),res);expect(res.code).toBe(400);expect(res.body).toMatchObject({error:{code:'CALLBACK_INVALID'}});});
});
