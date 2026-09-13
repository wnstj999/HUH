import { describe, expect, it, beforeEach } from 'vitest';
import {
  getLocalCustomTeams,
  saveLocalCustomTeam,
  deleteLocalCustomTeam,
  getLocalTournaments,
  getLocalTournamentDetail,
  createLocalTournament,
  updateLocalTournamentMatch,
  deleteLocalTournament,
} from '../src/lib/localTournamentStorage';

const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};

// Node 환경 polyfill
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
}

describe('localTournamentStorage (클라이언트 로컬 폴백 스토리지)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('커스텀 팀을 생성, 조회, 삭제할 수 있다', () => {
    const team = saveLocalCustomTeam({
      name: 'T1',
      members: [
        { position: 'TOP', riotId: 'Doran#KR1', playerName: '최현준' },
        { position: 'JUG', riotId: 'Oner#KR1', playerName: '문현준' },
        { position: 'MID', riotId: 'Faker#KR1', playerName: '이상혁' },
        { position: 'ADC', riotId: 'Gumayusi#KR1', playerName: '이민형' },
        { position: 'SUP', riotId: 'Keria#KR1', playerName: '류민석' },
      ],
    });

    expect(team.name).toBe('T1');
    expect(team.members.length).toBe(5);

    const list = getLocalCustomTeams();
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe(team.id);

    deleteLocalCustomTeam(team.id);
    expect(getLocalCustomTeams().length).toBe(0);
  });

  it('4강 토너먼트를 생성하고 대진표 구조를 정상 구성한다', () => {
    const t1 = saveLocalCustomTeam({ name: '팀A', members: [] });
    const t2 = saveLocalCustomTeam({ name: '팀B', members: [] });
    const t3 = saveLocalCustomTeam({ name: '팀C', members: [] });
    const t4 = saveLocalCustomTeam({ name: '팀D', members: [] });

    const tourney = createLocalTournament({
      name: '4강 친선전',
      bracketSize: 4,
      format: 'BO1',
      seedingType: 'POWER_SEED',
      teamIds: [t1.id, t2.id, t3.id, t4.id],
    });

    expect(tourney.bracketSize).toBe(4);
    const detail = getLocalTournamentDetail(tourney.id);
    // 4강은 총 3경기 (4강 2경기 + 결승 1경기)
    expect(detail.matches.length).toBe(3);

    const round1Matches = detail.matches.filter((m) => m.roundNumber === 1);
    expect(round1Matches.length).toBe(2);

    const finalMatch = detail.matches.find((m) => m.roundNumber === 2);
    expect(finalMatch).toBeDefined();
    expect(finalMatch?.status).toBe('PENDING');
  });

  it('경기 결과를 입력하면 다음 라운드로 승자가 전파되고, 결승 종료 시 토너먼트 우승팀이 확정된다', () => {
    const t1 = saveLocalCustomTeam({ name: '팀1', members: [] });
    const t2 = saveLocalCustomTeam({ name: '팀2', members: [] });
    const t3 = saveLocalCustomTeam({ name: '팀3', members: [] });
    const t4 = saveLocalCustomTeam({ name: '팀4', members: [] });

    const tourney = createLocalTournament({
      name: '우승 검증전',
      bracketSize: 4,
      format: 'BO3',
      seedingType: 'POWER_SEED',
      teamIds: [t1.id, t2.id, t3.id, t4.id],
    });

    const detail1 = getLocalTournamentDetail(tourney.id);
    const m1 = detail1.matches.find((m) => m.roundNumber === 1 && m.matchIndex === 0)!;
    const m2 = detail1.matches.find((m) => m.roundNumber === 1 && m.matchIndex === 1)!;

    // 1번 경기 t1 승리
    updateLocalTournamentMatch(tourney.id, {
      matchId: m1.id,
      winnerTeamId: t1.id,
      team1Score: 2,
      team2Score: 0,
    });

    // 2번 경기 t3 승리
    updateLocalTournamentMatch(tourney.id, {
      matchId: m2.id,
      winnerTeamId: t3.id,
      team1Score: 2,
      team2Score: 1,
    });

    // 결승전 확인
    const detail2 = getLocalTournamentDetail(tourney.id);
    const finalMatch = detail2.matches.find((m) => m.roundNumber === 2)!;
    expect(finalMatch.team1Id).toBe(t1.id);
    expect(finalMatch.team2Id).toBe(t3.id);
    expect(finalMatch.status).toBe('READY');

    // 결승전 t1 승리
    updateLocalTournamentMatch(tourney.id, {
      matchId: finalMatch.id,
      winnerTeamId: t1.id,
      team1Score: 2,
      team2Score: 1,
    });

    const finalDetail = getLocalTournamentDetail(tourney.id);
    expect(finalDetail.tournament.winnerTeamId).toBe(t1.id);
    expect(finalDetail.tournament.status).toBe('COMPLETED');
  });

  it('토너먼트를 삭제할 수 있다', () => {
    const tourney = createLocalTournament({
      name: '삭제 테스트',
      bracketSize: 4,
      teamIds: [],
    });
    expect(getLocalTournaments().length).toBe(1);

    deleteLocalTournament(tourney.id);
    expect(getLocalTournaments().length).toBe(0);
  });
});
