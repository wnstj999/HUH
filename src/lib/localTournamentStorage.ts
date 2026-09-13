import type { CustomTeam, Tournament, TournamentMatch } from '../types';

const TEAMS_KEY = 'huh_local_custom_teams';
const TOURNAMENTS_KEY = 'huh_local_tournaments';
const MATCHES_KEY = 'huh_local_tournament_matches';

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

// =======================
// 커스텀 팀 로컬 스토리지
// =======================

export function getLocalCustomTeams(): CustomTeam[] {
  return getStored<CustomTeam[]>(TEAMS_KEY, []);
}

export function saveLocalCustomTeam(input: {
  name: string;
  source?: 'MANUAL' | 'AUTO_BALANCED';
  notes?: string;
  members: Array<{ position: 'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP'; riotId: string; playerName?: string; playerId?: string; isCaptain?: boolean }>;
}): CustomTeam {
  const teams = getLocalCustomTeams();
  const id = 'local-team-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString();

  const newTeam: CustomTeam = {
    id,
    name: input.name.trim() || '커스텀 팀',
    source: input.source || 'MANUAL',
    notes: input.notes || '',
    createdAt: now,
    updatedAt: now,
    members: input.members.map((m, idx) => ({
      id: 'local-member-' + id + '-' + idx,
      teamId: id,
      playerId: m.playerId || null,
      riotId: m.riotId,
      playerName: m.playerName || m.riotId.split('#')[0] || '선수',
      position: m.position,
      isCaptain: Boolean(m.isCaptain),
      createdAt: now,
    })),
  };

  teams.unshift(newTeam);
  setStored(TEAMS_KEY, teams);
  return newTeam;
}

export function updateLocalCustomTeam(id: string, input: Partial<CustomTeam>): CustomTeam {
  const teams = getLocalCustomTeams();
  const idx = teams.findIndex((t) => t.id === id);
  if (idx === -1) throw new Error('해당 팀을 찾을 수 없습니다.');

  const existing = teams[idx];
  if (!existing) throw new Error('해당 팀을 찾을 수 없습니다.');

  const updated: CustomTeam = {
    ...existing,
    ...input,
    updatedAt: new Date().toISOString(),
  };

  teams[idx] = updated;
  setStored(TEAMS_KEY, teams);
  return updated;
}

export function deleteLocalCustomTeam(id: string): void {
  const teams = getLocalCustomTeams();
  const filtered = teams.filter((t) => t.id !== id);
  setStored(TEAMS_KEY, filtered);
}

// =======================
// 토너먼트 로컬 스토리지
// =======================

interface SeedPair {
  team1Id: string | null;
  team2Id: string | null;
}

function generateStandardSeeds(teamIds: string[], size: 4 | 8 | 16): SeedPair[] {
  const padded: Array<string | null> = [...teamIds];
  while (padded.length < size) {
    padded.push(null);
  }

  if (size === 4) {
    return [
      { team1Id: padded[0] ?? null, team2Id: padded[3] ?? null },
      { team1Id: padded[1] ?? null, team2Id: padded[2] ?? null },
    ];
  }

  if (size === 8) {
    return [
      { team1Id: padded[0] ?? null, team2Id: padded[7] ?? null },
      { team1Id: padded[3] ?? null, team2Id: padded[4] ?? null },
      { team1Id: padded[1] ?? null, team2Id: padded[6] ?? null },
      { team1Id: padded[2] ?? null, team2Id: padded[5] ?? null },
    ];
  }

  return [
    { team1Id: padded[0] ?? null, team2Id: padded[15] ?? null },
    { team1Id: padded[7] ?? null, team2Id: padded[8] ?? null },
    { team1Id: padded[3] ?? null, team2Id: padded[12] ?? null },
    { team1Id: padded[4] ?? null, team2Id: padded[11] ?? null },
    { team1Id: padded[1] ?? null, team2Id: padded[14] ?? null },
    { team1Id: padded[6] ?? null, team2Id: padded[9] ?? null },
    { team1Id: padded[2] ?? null, team2Id: padded[13] ?? null },
    { team1Id: padded[5] ?? null, team2Id: padded[10] ?? null },
  ];
}

export function getLocalTournaments(): Tournament[] {
  return getStored<Tournament[]>(TOURNAMENTS_KEY, []);
}

export function getLocalTournamentDetail(id: string): { tournament: Tournament; matches: TournamentMatch[] } {
  const tourneys = getLocalTournaments();
  const tourney = tourneys.find((t) => t.id === id);
  if (!tourney) throw new Error('토너먼트를 찾을 수 없습니다.');

  const allMatches = getStored<TournamentMatch[]>(MATCHES_KEY, []);
  const matches = allMatches
    .filter((m) => m.tournamentId === id)
    .sort((a, b) => (a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchIndex - b.matchIndex));

  // 팀 정보 매핑
  const teams = getLocalCustomTeams();
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const enrichedMatches = matches.map((m) => ({
    ...m,
    team1: m.team1Id ? teamMap.get(m.team1Id) : undefined,
    team2: m.team2Id ? teamMap.get(m.team2Id) : undefined,
    winnerTeam: m.winnerTeamId ? teamMap.get(m.winnerTeamId) : undefined,
  }));

  return { tournament: tourney, matches: enrichedMatches };
}

export function createLocalTournament(input: {
  name: string;
  bracketSize: 4 | 8 | 16;
  format?: 'BO1' | 'BO3' | 'BO5';
  seedingType?: 'RANDOM' | 'POWER_SEED' | 'MANUAL';
  teamIds: string[];
}): Tournament {
  const tourneys = getLocalTournaments();
  const allMatches = getStored<TournamentMatch[]>(MATCHES_KEY, []);

  const tourneyId = 'local-tourney-' + Date.now();
  const now = new Date().toISOString();
  const size = input.bracketSize;
  let teamIds = [...input.teamIds];

  if (input.seedingType === 'RANDOM') {
    teamIds = teamIds.sort(() => Math.random() - 0.5);
  }

  const newTourney: Tournament = {
    id: tourneyId,
    name: input.name.trim() || '로컬 토너먼트',
    bracketSize: size,
    format: input.format || 'BO1',
    seedingType: input.seedingType || 'POWER_SEED',
    status: 'READY',
    winnerTeamId: null,
    settings: { originalTeamIds: teamIds },
    createdAt: now,
    updatedAt: now,
  };

  const totalRounds = Math.log2(size);
  const round1Pairs = generateStandardSeeds(teamIds, size);

  interface TempNode {
    id: string;
    round: number;
    index: number;
    team1Id: string | null;
    team2Id: string | null;
    status: 'PENDING' | 'READY' | 'COMPLETED' | 'BYE';
    winnerId: string | null;
    nextSlot?: 'team1' | 'team2';
    nextIndex?: number;
    nextMatchId?: string | null;
  }

  const grid: TempNode[][] = [];

  for (let r = 1; r <= totalRounds; r += 1) {
    const matchCount = size / Math.pow(2, r);
    const row: TempNode[] = [];
    for (let i = 0; i < matchCount; i += 1) {
      const matchId = 'local-m-' + tourneyId + '-r' + r + '-i' + i;
      if (r === 1) {
        const pair = round1Pairs[i];
        const t1 = pair?.team1Id ?? null;
        const t2 = pair?.team2Id ?? null;
        const isBye1 = Boolean(t1 && !t2);
        const isBye2 = Boolean(!t1 && t2);
        const winnerId = isBye1 ? t1 : isBye2 ? t2 : null;
        const status = winnerId ? 'BYE' : t1 && t2 ? 'READY' : 'PENDING';

        row.push({
          id: matchId,
          round: r,
          index: i,
          team1Id: t1,
          team2Id: t2,
          status,
          winnerId,
          nextSlot: i % 2 === 0 ? 'team1' : 'team2',
          nextIndex: Math.floor(i / 2),
        });
      } else {
        row.push({
          id: matchId,
          round: r,
          index: i,
          team1Id: null,
          team2Id: null,
          status: 'PENDING',
          winnerId: null,
          nextSlot: r < totalRounds ? (i % 2 === 0 ? 'team1' : 'team2') : undefined,
          nextIndex: r < totalRounds ? Math.floor(i / 2) : undefined,
        });
      }
    }
    grid.push(row);
  }

  // 1라운드 부전승 다음 라운드로 전파
  const round1 = grid[0];
  const round2 = grid[1];
  if (round1 && round2) {
    for (let i = 0; i < round1.length; i += 1) {
      const m1 = round1[i];
      if (m1?.winnerId && m1.nextIndex !== undefined) {
        const nextMatch = round2[m1.nextIndex];
        if (nextMatch) {
          if (m1.nextSlot === 'team1') nextMatch.team1Id = m1.winnerId;
          else if (m1.nextSlot === 'team2') nextMatch.team2Id = m1.winnerId;
        }
      }
    }
  }

  // nextMatchId 연결 및 TournamentMatch 목록 생성
  const createdMatches: TournamentMatch[] = [];
  for (let r = 1; r <= totalRounds; r += 1) {
    const row = grid[r - 1];
    if (!row) continue;
    for (const node of row) {
      let nextMatchId: string | null = null;
      const nextRoundRow = grid[r];
      if (node.nextIndex !== undefined && nextRoundRow && nextRoundRow[node.nextIndex]) {
        nextMatchId = nextRoundRow[node.nextIndex]?.id || null;
      }

      createdMatches.push({
        id: node.id,
        tournamentId: tourneyId,
        roundNumber: node.round,
        matchIndex: node.index,
        team1Id: node.team1Id,
        team2Id: node.team2Id,
        team1Score: 0,
        team2Score: 0,
        winnerTeamId: node.winnerId,
        status: node.status,
        nextMatchId,
        nextSlot: node.nextSlot || null,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  tourneys.unshift(newTourney);
  setStored(TOURNAMENTS_KEY, tourneys);
  setStored(MATCHES_KEY, [...allMatches, ...createdMatches]);

  return newTourney;
}

export function updateLocalTournamentMatch(
  tournamentId: string,
  input: {
    matchId: string;
    winnerTeamId: string | null;
    team1Score: number;
    team2Score: number;
    forceUpdate?: boolean;
  }
): TournamentMatch[] {
  const allMatches = getStored<TournamentMatch[]>(MATCHES_KEY, []);
  const matchIdx = allMatches.findIndex((m) => m.id === input.matchId);
  if (matchIdx === -1) throw new Error('해당 대진 경기를 찾을 수 없습니다.');

  const currentMatch = allMatches[matchIdx];
  if (!currentMatch) throw new Error('해당 대진 경기를 찾을 수 없습니다.');

  const prevWinnerId = currentMatch.winnerTeamId;
  const nextMatchId = currentMatch.nextMatchId;
  const nextSlot = currentMatch.nextSlot;
  const now = new Date().toISOString();

  // 다음 라운드 충돌 검사
  if (prevWinnerId && input.winnerTeamId && prevWinnerId !== input.winnerTeamId && nextMatchId) {
    const nextMatch = allMatches.find((m) => m.id === nextMatchId);
    if (nextMatch && (nextMatch.winnerTeamId || nextMatch.status === 'COMPLETED' || nextMatch.status === 'IN_PROGRESS')) {
      if (!input.forceUpdate) {
        const error = new Error('이미 다음 라운드 결과가 입력되어 있습니다. 이전 경기 결과를 수정하면 다음 라운드 대진 및 결과가 초기화됩니다.') as Error & { conflict?: boolean; data?: unknown };
        error.conflict = true;
        error.data = {
          affectedMatch: {
            roundNumber: nextMatch.roundNumber,
            matchIndex: nextMatch.matchIndex,
          },
        };
        throw error;
      }

      // 강제 업데이트: 다음 경기 초기화
      nextMatch.winnerTeamId = null;
      nextMatch.team1Score = 0;
      nextMatch.team2Score = 0;
      nextMatch.status = 'READY';
      nextMatch.updatedAt = now;
    }
  }

  // 현재 경기 업데이트
  const isCompleted = Boolean(input.winnerTeamId);
  currentMatch.winnerTeamId = input.winnerTeamId;
  currentMatch.team1Score = input.team1Score;
  currentMatch.team2Score = input.team2Score;
  currentMatch.status = isCompleted ? 'COMPLETED' : 'READY';
  currentMatch.updatedAt = now;

  // 다음 라운드로 승자 진출
  if (nextMatchId && nextSlot) {
    const nextMatch = allMatches.find((m) => m.id === nextMatchId);
    if (nextMatch) {
      if (nextSlot === 'team1') nextMatch.team1Id = input.winnerTeamId;
      else if (nextSlot === 'team2') nextMatch.team2Id = input.winnerTeamId;
      nextMatch.status = nextMatch.team1Id && nextMatch.team2Id ? 'READY' : 'PENDING';
      nextMatch.updatedAt = now;
    }
  } else if (!nextMatchId && input.winnerTeamId) {
    // 결승전 우승팀 처리
    const tourneys = getLocalTournaments();
    const t = tourneys.find((tourn) => tourn.id === tournamentId);
    if (t) {
      t.winnerTeamId = input.winnerTeamId;
      t.status = 'COMPLETED';
      t.updatedAt = now;
      setStored(TOURNAMENTS_KEY, tourneys);
    }
  }

  setStored(MATCHES_KEY, allMatches);
  return getLocalTournamentDetail(tournamentId).matches;
}

export function deleteLocalTournament(id: string): void {
  const tourneys = getLocalTournaments();
  const filtered = tourneys.filter((t) => t.id !== id);
  setStored(TOURNAMENTS_KEY, filtered);

  const allMatches = getStored<TournamentMatch[]>(MATCHES_KEY, []);
  const filteredMatches = allMatches.filter((m) => m.tournamentId !== id);
  setStored(MATCHES_KEY, filteredMatches);
}
