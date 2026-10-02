import { HttpError } from '../lib/http.js';
export interface TournamentProviderInput { region: 'KR'; callbackUrl: string }
export interface TournamentCodeInput { tournamentId: number; metadata: string; puuids: string[] }
export interface TournamentAdapter {
 createProvider(input: TournamentProviderInput): Promise<number>;
 createTournament(providerId: number, name: string): Promise<number>;
 createCode(input: TournamentCodeInput): Promise<string>;
}
// Never retry POST automatically: a timeout may occur after Riot created the resource.
export class RiotTournamentAdapter implements TournamentAdapter {
 constructor(private readonly key: string) {}
 private async post<T>(path: string, body: unknown): Promise<T> {
  const response=await fetch(`https://asia.api.riotgames.com/lol/tournament/v5/${path}`,{method:'POST',headers:{'X-Riot-Token':this.key,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new HttpError(response.status,'TOURNAMENT_REQUEST_FAILED',`Riot Tournament 요청 실패 (${response.status}). 권한과 연결을 확인하세요.`);
  return response.json() as Promise<T>;
 }
 async createProvider(input: TournamentProviderInput): Promise<number> {
  const url=new URL(input.callbackUrl);
  if(url.protocol!=='https:' || url.username || url.password) throw new HttpError(400,'CALLBACK_URL_INVALID','공개 HTTPS 결과 수신 주소가 필요합니다.');
  return this.post<number>('providers',{region:input.region,url:url.toString()});
 }
 createTournament(providerId: number,name: string): Promise<number> {return this.post<number>('tournaments',{providerId,name});}
 async createCode(input: TournamentCodeInput): Promise<string> {
  const codes=await this.post<string[]>(`codes?count=1&tournamentId=${input.tournamentId}`,{mapType:'SUMMONERS_RIFT',pickType:'TOURNAMENT_DRAFT',spectatorType:'LOBBYONLY',teamSize:5,allowedParticipants:input.puuids,metadata:input.metadata});
  if(!Array.isArray(codes)||codes.length!==1||typeof codes[0]!=='string'||!codes[0]) throw new HttpError(502,'TOURNAMENT_RESPONSE_INVALID','Riot 코드 응답을 확인하지 못했습니다.');
  return codes[0];
 }
}
export function tournamentConfiguration() {
 const providerId=Number(process.env.TOURNAMENT_PROVIDER_ID);
 return {enabled:process.env.TOURNAMENT_API_ENABLED==='true'&&Number.isSafeInteger(providerId)&&providerId>0,providerId};
}
export class DisabledTournamentAdapter implements TournamentAdapter {
 createProvider(): Promise<number>{return Promise.reject(new HttpError(503,'TOURNAMENT_NOT_READY','Tournament API 권한과 운영 연결을 준비 중입니다.'));}
 createTournament(): Promise<number>{return this.createProvider();}
 createCode(): Promise<string>{return this.createProvider().then(String);}
}
