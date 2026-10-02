import type { InhouseEvent, InhouseMatch, Player, PlayerInput, MatchParticipant, Position } from '../types';
import { TIER_SCORES } from '../types';
import { parseRiotId } from './riotId';
import { mapPlayer } from '../../server/lib/mappers';

export const LOCAL_MODE = import.meta.env.VITE_LOCAL_MODE === 'true' ||
  (import.meta.env.DEV && !import.meta.env.VITE_API_BASE_URL?.trim());
const KEY = 'huh.local.v1';
interface State { players: Player[]; events: InhouseEvent[]; matches: InhouseMatch[] }
function read(): State {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { players: [], events: [], matches: [] };
  try {
    const data = JSON.parse(raw) as State;
    if (!Array.isArray(data.players) || !Array.isArray(data.events) || !Array.isArray(data.matches)) throw new Error();
    return data;
  } catch { throw new Error('로컬 저장 데이터를 읽을 수 없습니다. 브라우저 데이터를 지우기 전에 백업하세요.'); }
}
function write(data: State) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { throw new Error('브라우저 저장 공간이 부족하거나 차단되었습니다. 변경사항이 저장되지 않았습니다.'); }
}
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const positions: Position[] = ['TOP', 'JUG', 'MID', 'ADC', 'SUP'];
function playerInput(input: Partial<PlayerInput>, previous?: Player): Player {
  const value = { ...previous, ...input };
  const riot = parseRiotId(value.riotId ?? '');
  if (!value.displayName?.trim()) throw new Error('이름을 입력하세요.');
  if (!value.inhouseTier || !Object.hasOwn(TIER_SCORES, value.inhouseTier)) throw new Error('올바른 내전 티어를 선택하세요.');
  if (!value.positions?.length || value.positions.some(p => !positions.includes(p))) throw new Error('포지션을 선택하세요.');
  return { ...mapPlayer({}), ...previous, ...value, id: previous?.id ?? id(), displayName: value.displayName.trim(),
    riotId: riot.riotId, riotGameName: riot.gameName, riotTagLine: riot.tagLine,
    inhouseTier: value.inhouseTier, inhouseScore: TIER_SCORES[value.inhouseTier], positions: [...new Set(value.positions)],
    active: value.active !== false, participating: Boolean(value.participating), note: value.note ?? '',
    createdAt: previous?.createdAt ?? now(), updatedAt: now() };
}
export function seedLocalDemo() {
  const data = read();
  if (data.players.length || data.matches.length) throw new Error('예시 선수는 빈 저장소에만 추가할 수 있습니다.');
  data.players = Array.from({ length: 10 }, (_, i) => playerInput({ displayName: `예시 선수 ${i + 1}`, riotId: `Demo Player ${i + 1}#DEMO`, inhouseTier: i % 2 ? 'B' : 'A', positions: [positions[i % 5]!], active: true, participating: true, note: '시연용 가상 선수입니다. 실제 Riot 조회 데이터가 아닙니다.' }));
  write(data);
}
export async function localRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  if (path === '/api/health') return { status: 'ok', backend: false, database: false, riotConfigured: false, opggEnabled: false, tournamentEnabled: false, timestamp: now() } as T;
  if (path === '/api/settings/riot-key' && method === 'GET') return { configured: false, source: 'none', updatedAt: null } as T;
  if (path.startsWith('/api/riot/') || path.startsWith('/api/opgg/') || path.startsWith('/api/settings/')) throw new Error('로컬 시연 모드는 Riot 키를 저장하거나 외부 전적을 조회하지 않습니다. 서버 연결이 필요합니다.');
  if (path.startsWith('/api/analysis/power')) return (path.includes('?') ? { playerId: new URLSearchParams(path.split('?')[1]).get('playerId'), rating: null, topChampions: [], positionStats: [], totalCachedMatches: 0, lastCalculatedAt: null } : { ratings: {} }) as T;
  const data = read();
  const parts = path.split('/');
  const resource = parts[2]; const target = parts[3];
  let result: unknown;
  if (resource === 'players') {
    if (method === 'GET') return { players: data.players } as T;
    const previous = target ? data.players.find(p => p.id === target) : undefined;
    if (target && !previous) throw new Error('선수를 찾을 수 없습니다.');
    const player = playerInput(method === 'DELETE' ? { active: false, participating: false } : body as Partial<PlayerInput>, previous);
    if (data.players.some(p => p.id !== player.id && p.riotId.toLowerCase() === player.riotId.toLowerCase())) throw new Error('같은 Riot ID가 이미 등록되어 있습니다.');
    data.players = previous ? data.players.map(p => p.id === target ? player : p) : [...data.players, player];
    result = { player };
  } else if (resource === 'events' || resource === 'matches') {
    if (method === 'GET') return { [resource]: data[resource] } as T;
    if (resource === 'matches' && target) {
      const match = data.matches.find(m => m.id === target);
      if (!match) throw new Error('경기를 찾을 수 없습니다.');
      const patch = body as Partial<InhouseMatch>;
      if (patch.status && !['READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(patch.status)) throw new Error('올바른 경기 상태가 필요합니다.');
      if ('winnerTeam' in patch && patch.winnerTeam !== null && patch.winnerTeam !== 'BLUE' && patch.winnerTeam !== 'RED') throw new Error('승리팀을 선택하세요.');
      for (const key of ['status', 'winnerTeam', 'startedAt', 'endedAt', 'durationSeconds'] as const) if (key in patch) Object.assign(match, { [key]: patch[key] });
      if ('winnerTeam' in patch) match.participants.forEach(p => { p.win = match.winnerTeam ? p.team === match.winnerTeam : null; });
      result = { match };
    } else {
      const name = String(body.eventName ?? body.name ?? '').trim();
      if (!name) throw new Error('내전 이름을 입력하세요.');
      const assignments = (body.assignments ?? []) as { playerId: string; team: 'BLUE' | 'RED'; position: Position }[];
      if (resource === 'matches' && (assignments.length !== 10 || new Set(assignments.map(a => a.playerId)).size !== 10 || assignments.some(a => !data.players.some(p => p.id === a.playerId && p.active && p.positions.includes(a.position))) || ['BLUE', 'RED'].some(team => positions.some(pos => assignments.filter(a => a.team === team && a.position === pos).length !== 1)))) throw new Error('활성 선수 10명과 팀별 포지션 5개가 필요합니다.');
      const event: InhouseEvent = { id: id(), name, status: 'READY', participantCount: resource === 'matches' ? 10 : (body.playerIds as string[] ?? []).length, createdAt: now(), updatedAt: now() };
      data.events.unshift(event);
      if (resource === 'events') result = { event };
      else {
        const match: InhouseMatch = { id: id(), eventId: event.id, event: { id: event.id, name }, tournamentCode: null, riotGameId: null, status: 'READY', winnerTeam: null, startedAt: null, endedAt: null, durationSeconds: null, createdAt: now(), participants: [] };
        match.participants = assignments.map(a => ({ id: id(), matchId: match.id, ...a, player: data.players.find(p => p.id === a.playerId), championId: null, championName: null, win: null, kills: null, deaths: null, assists: null, cs: null, gold: null, damageToChampions: null, visionScore: null }));
        data.matches.unshift(match); result = { match };
      }
    }
  } else if (resource === 'match-participants') {
    const participant = data.matches.flatMap(m => m.participants).find(p => p.id === target);
    if (!participant) throw new Error('참가 기록을 찾을 수 없습니다.');
    for (const key of ['championId', 'championName', 'kills', 'deaths', 'assists', 'cs', 'gold', 'damageToChampions', 'visionScore'] as const) {
      if (!(key in body)) continue;
      const value = body[key];
      if (key === 'championName') participant[key] = String(value ?? '').trim() || null;
      else { const number = value === '' || value == null ? null : Number(value); if (number !== null && (!Number.isInteger(number) || number < 0)) throw new Error('경기 수치는 0 이상의 정수여야 합니다.'); participant[key] = number; }
    }
    result = { participant: participant as MatchParticipant };
  } else throw new Error('로컬 모드에서 지원하지 않는 요청입니다.');
  write(data); return result as T;
}
