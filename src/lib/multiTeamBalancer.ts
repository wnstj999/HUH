import type { MultiTeamPlan, MultiTeamAssignment, Player, Position, PowerRating, TeamConstraints } from '../types';
import { calculatePowerRating } from '../../server/lib/powerRating';

export const POSITIONS: Position[] = ['TOP', 'JUG', 'MID', 'ADC', 'SUP'];

export class MultiTeamBuildError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

// 플레이어의 포지션별 전력 점수 추출 (PowerRating이 없으면 inhouseScore 또는 기본값 기반)
export function getPlayerPositionScore(
  player: Player,
  position: Position,
  ratings?: Record<string, PowerRating>,
): { score: number; isMain: boolean; confidence: 'HIGH' | 'MEDIUM' | 'LOW' } {
  const rating = ratings ? ratings[player.id] : null;
  if (rating) {
    const posKey = `${position.toLowerCase()}Score` as keyof PowerRating;
    const scoreVal = Number(rating[posKey] ?? rating.overallScore ?? 1500);
    const posGamesKey = `${position.toLowerCase()}Games` as keyof PowerRating;
    const games = Number(rating[posGamesKey] ?? 0);
    const isMain = games >= 5;
    return {
      score: scoreVal,
      isMain,
      confidence: games < 5 ? 'LOW' : rating.confidenceLevel,
    };
  }

  // 레이팅이 없을 때 fallback: player.inhouseScore (4~15)
  const base = calculatePowerRating(player, []).overallScore;
  const isPref = player.positions.includes(position);
  return {
    score: isPref ? base : Math.round(base * 0.88),
    isMain: isPref,
    confidence: 'LOW',
  };
}

// 제약 조건 검증
function validateConstraints(
  players: Player[],
  numTeams: number,
  constraints: TeamConstraints,
): void {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  if (playerMap.size !== players.length) throw new MultiTeamBuildError('DUPLICATE_PLAYER', '같은 플레이어를 중복 배정할 수 없습니다.');
  const ids = [...Object.keys(constraints.pinnedTeams), ...Object.keys(constraints.pinnedPositions), ...constraints.pairedPlayers.flat(), ...constraints.isolatedPlayers.flat()];
  if (ids.some((id) => !playerMap.has(id))) throw new MultiTeamBuildError('UNKNOWN_PLAYER', '선택하지 않은 플레이어의 고정 조건을 제거해 주세요.');
  const slots = new Set<string>();
  for (const [id, pos] of Object.entries(constraints.pinnedPositions)) {
    if (!POSITIONS.includes(pos)) throw new MultiTeamBuildError('INVALID_POSITION', '올바르지 않은 포지션입니다.');
    const team = constraints.pinnedTeams[id];
    if (team !== undefined) {
      const slot = `${team}:${pos}`;
      if (slots.has(slot)) throw new MultiTeamBuildError('DUPLICATE_SLOT', '같은 팀의 같은 포지션에 두 명이 고정되어 있습니다.');
      slots.add(slot);
    }
  }

  // 1. 고정 팀 인덱스 유효성
  for (const teamIdx of Object.values(constraints.pinnedTeams)) {
    if (!Number.isInteger(teamIdx) || teamIdx < 0 || teamIdx >= numTeams) {
      throw new MultiTeamBuildError(
        'INVALID_PINNED_TEAM',
        `플레이어 고정 팀 번호가 유효 범위를 벗어났습니다. (0~${numTeams - 1})`,
      );
    }
  }

  // 2. 같은 팀 희망 & 금지 조건 충돌 검증
  const pairSet = new Set(constraints.pairedPlayers.map(([a, b]) => `${a}:${b}`));
  for (const [a, b] of constraints.isolatedPlayers) {
    if (pairSet.has(`${a}:${b}`) || pairSet.has(`${b}:${a}`)) {
      const p1 = playerMap.get(a)?.displayName || a;
      const p2 = playerMap.get(b)?.displayName || b;
      throw new MultiTeamBuildError(
        'CONFLICTING_CONSTRAINTS',
        `플레이어 [${p1}]과 [${p2}]는 '같은 팀 희망'과 '배정 금지' 조건이 동시에 지정되어 있습니다.`,
      );
    }
  }

  // 3. 고정 팀에 따른 모순 검증
  for (const [a, b] of constraints.pairedPlayers) {
    const tA = constraints.pinnedTeams[a];
    const tB = constraints.pinnedTeams[b];
    if (tA !== undefined && tB !== undefined && tA !== tB) {
      const p1 = playerMap.get(a)?.displayName || a;
      const p2 = playerMap.get(b)?.displayName || b;
      throw new MultiTeamBuildError(
        'CONFLICTING_TEAM_PINS',
        `[${p1}](팀 ${tA + 1})과 [${p2}](팀 ${tB + 1})는 다른 팀에 고정되어 있어 '같은 팀 희망' 조건을 만족할 수 없습니다.`,
      );
    }
  }

  for (const [a, b] of constraints.isolatedPlayers) {
    const tA = constraints.pinnedTeams[a];
    const tB = constraints.pinnedTeams[b];
    if (tA !== undefined && tB !== undefined && tA === tB) {
      const p1 = playerMap.get(a)?.displayName || a;
      const p2 = playerMap.get(b)?.displayName || b;
      throw new MultiTeamBuildError(
        'CONFLICTING_TEAM_PINS',
        `[${p1}]과 [${p2}]는 모두 팀 ${tA + 1}에 고정되어 있어 '배정 금지' 조건을 만족할 수 없습니다.`,
      );
    }
  }
}

// 한 배정 상태가 제약 조건을 지키는지 체크
function satisfiesConstraints(
  assignmentList: MultiTeamAssignment[],
  constraints: TeamConstraints,
): boolean {
  const pTeamMap = new Map<string, number>();
  const pPosMap = new Map<string, Position>();

  for (const a of assignmentList) {
    pTeamMap.set(a.player.id, a.teamIndex);
    pPosMap.set(a.player.id, a.position);
  }

  // 포지션 고정
  for (const [pId, pos] of Object.entries(constraints.pinnedPositions)) {
    if (pPosMap.get(pId) !== pos) return false;
  }

  // 팀 고정
  for (const [pId, tIdx] of Object.entries(constraints.pinnedTeams)) {
    if (pTeamMap.get(pId) !== tIdx) return false;
  }

  // 같은 팀 희망
  for (const [a, b] of constraints.pairedPlayers) {
    const tA = pTeamMap.get(a);
    const tB = pTeamMap.get(b);
    if (tA !== undefined && tB !== undefined && tA !== tB) return false;
  }

  // 같은 팀 금지
  for (const [a, b] of constraints.isolatedPlayers) {
    const tA = pTeamMap.get(a);
    const tB = pTeamMap.get(b);
    if (tA !== undefined && tB !== undefined && tA === tB) return false;
  }

  return true;
}

// 점수 평가 함수
function evaluateAssignmentList(
  assignmentList: MultiTeamAssignment[],
  numTeams: number,
  mode: 'SCORE_BALANCE' | 'ROLE_MASTERY' | 'LANE_MATCHUP',
): number {
  // 팀별 점수 합산
  const teamScores = new Array(numTeams).fill(0);
  let totalOffRole = 0;

  for (const a of assignmentList) {
    teamScores[a.teamIndex] += a.ratingScore;
    if (!a.isMainPosition) totalOffRole += 1;
  }

  const avg = teamScores.reduce((acc, s) => acc + s, 0) / numTeams;
  const variance = teamScores.reduce((acc, s) => acc + Math.pow(s - avg, 2), 0) / numTeams;
  const scoreStdDev = Math.sqrt(variance);

  // 라인별 격차
  let laneDiffSum = 0;
  for (const pos of POSITIONS) {
    const posScores = assignmentList.filter((a) => a.position === pos).map((a) => a.ratingScore);
    const maxP = Math.max(...posScores);
    const minP = Math.min(...posScores);
    laneDiffSum += (maxP - minP);
  }

  if (mode === 'SCORE_BALANCE') {
    // 팀 점수 차이 최소화가 최우선
    return scoreStdDev * 2.0 + totalOffRole * 25 + laneDiffSum * 0.2;
  }
  if (mode === 'ROLE_MASTERY') {
    // 포지션 숙련도(비주력 최소화)가 최우선
    return totalOffRole * 200 + scoreStdDev * 0.8 + laneDiffSum * 0.2;
  }
  // LANE_MATCHUP: 라인전 맞대결 격차 최소화가 최우선
  return laneDiffSum * 1.5 + scoreStdDev * 1.0 + totalOffRole * 35;
}

// 배정 리스트를 MultiTeamPlan 형태로 포장
function buildPlanResult(
  name: string,
  description: string,
  assignmentList: MultiTeamAssignment[],
  numTeams: number,
  ratings?: Record<string, PowerRating>,
): MultiTeamPlan {
  const teams = [];
  const teamNames = ['BLUE', 'RED', 'GREEN', 'YELLOW', 'PURPLE', 'ORANGE', 'WHITE', 'BLACK',
    'ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA', 'ETA', 'THETA'];

  let totalOffRoleCount = 0;
  const teamTotalScores: number[] = [];

  for (let i = 0; i < numTeams; i += 1) {
    const tAssignments = assignmentList
      .filter((a) => a.teamIndex === i)
      .sort((a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position));

    const totalScore = tAssignments.reduce((acc, a) => acc + a.ratingScore, 0);
    teamTotalScores.push(totalScore);
    const offRoleCount = tAssignments.filter((a) => !a.isMainPosition).length;
    totalOffRoleCount += offRoleCount;

    const confidences = tAssignments.map((a) => getPlayerPositionScore(a.player, a.position, ratings).confidence);
    const confidence: 'HIGH' | 'MEDIUM' | 'LOW' = confidences.includes('LOW') ? 'LOW' : confidences.every((c) => c === 'HIGH') ? 'HIGH' : 'MEDIUM';

    teams.push({
      teamIndex: i,
      teamName: `팀 ${i + 1} (${teamNames[i % teamNames.length]})`,
      totalScore,
      averageScore: Math.round(totalScore / 5),
      confidence,
      offRoleCount,
      assignments: tAssignments,
    });
  }

  const avg = teamTotalScores.reduce((acc, s) => acc + s, 0) / numTeams;
  const variance = teamTotalScores.reduce((acc, s) => acc + Math.pow(s - avg, 2), 0) / numTeams;
  const scoreStdDev = Math.round(Math.sqrt(variance));

  let maxLaneDiff = 0;
  for (const pos of POSITIONS) {
    const scores = assignmentList.filter((a) => a.position === pos).map((a) => a.ratingScore);
    const diff = Math.max(...scores) - Math.min(...scores);
    if (diff > maxLaneDiff) maxLaneDiff = diff;
  }

  return {
    name,
    description,
    teams,
    scoreStdDev,
    maxLaneDiff: Math.round(maxLaneDiff),
    totalOffRoleCount,
  };
}

// 메인 탐색 알고리즘
export function buildMultiTeams(
  players: Player[],
  ratings?: Record<string, PowerRating>,
  constraints: TeamConstraints = { pinnedPositions: {}, pinnedTeams: {}, pairedPlayers: [], isolatedPlayers: [] },
): { plans: MultiTeamPlan[] } {
  const count = players.length;
  if (![10, 20, 40, 80].includes(count)) {
    throw new MultiTeamBuildError(
      'INVALID_PLAYER_COUNT',
      `참가자 수는 10명(2팀), 20명(4팀), 40명(8팀), 80명(16팀)이어야 합니다. (현재 ${count}명)`,
    );
  }

  const numTeams = count / 5;
  validateConstraints(players, numTeams, constraints);

  // 초기 유효 배정 생성 시도
  // 각 포지션별 필요한 인원: numTeams명씩
  // 우선 포지션 선호도/숙련도를 고려하여 슬롯 생성
  // Most-constrained-first search enforces pairs and pins during construction.
  // A bounded search failure is not proof that constraints are impossible.
  const slots = Array.from({ length: numTeams }, (_, teamIndex) =>
    POSITIONS.map((position) => ({ teamIndex, position }))).flat();
  let nodes = 0;
  const result: MultiTeamAssignment[] = [];
  const used = new Set<string>();
  function candidates(slot: { teamIndex: number; position: Position }) {
    return players.filter((p) => {
      if (used.has(p.id)) return false;
      if (constraints.pinnedTeams[p.id] !== undefined && constraints.pinnedTeams[p.id] !== slot.teamIndex) return false;
      if (constraints.pinnedPositions[p.id] && constraints.pinnedPositions[p.id] !== slot.position) return false;
      for (const [a, b] of constraints.pairedPlayers) {
        const other = a === p.id ? b : b === p.id ? a : null;
        if (!other) continue;
        const team = result.find((r) => r.player.id === other)?.teamIndex ?? constraints.pinnedTeams[other];
        if (team !== undefined && team !== slot.teamIndex) return false;
      }
      for (const [a, b] of constraints.isolatedPlayers) {
        const other = a === p.id ? b : b === p.id ? a : null;
        if (other === p.id) return false;
        if (other && result.some((r) => r.player.id === other && r.teamIndex === slot.teamIndex)) return false;
      }
      return true;
    }).sort((a, b) => Number(getPlayerPositionScore(b, slot.position, ratings).isMain) - Number(getPlayerPositionScore(a, slot.position, ratings).isMain) || a.id.localeCompare(b.id));
  }
  function visit(remaining: typeof slots): boolean {
    if (++nodes > 50000) return false;
    if (!remaining.length) return satisfiesConstraints(result, constraints);
    const choices = remaining.map((slot) => ({ slot, players: candidates(slot) })).sort((a, b) => a.players.length - b.players.length);
    const choice = choices[0]!;
    for (const player of choice.players) {
      const stat = getPlayerPositionScore(player, choice.slot.position, ratings);
      result.push({ ...choice.slot, teamName: `Team ${choice.slot.teamIndex + 1}`, player, ratingScore: stat.score, isMainPosition: stat.isMain });
      used.add(player.id);
      if (visit(remaining.filter((slot) => slot !== choice.slot))) return true;
      used.delete(player.id);
      result.pop();
      if (nodes > 50000) return false;
    }
    return false;
  }
  if (!visit(slots)) throw new MultiTeamBuildError(
    nodes > 50000 ? 'SEARCH_LIMIT' : 'UNSATISFIABLE_CONSTRAINTS',
    nodes > 50000 ? '탐색 한도 내에서 배정을 찾지 못했습니다. 일부 고정 조건을 조정해 주세요.' : '설정한 조건으로 팀별 5개 포지션을 구성할 수 없습니다.',
  );
  const baseAssignment = result;

  // 3가지 모드별 최적화 실행 (Simulated Annealing / Local Search)
  const modes: Array<{
    mode: 'SCORE_BALANCE' | 'ROLE_MASTERY' | 'LANE_MATCHUP';
    name: string;
    description: string;
  }> = [
    {
      mode: 'SCORE_BALANCE',
      name: '전체 전력 균형 우선 (추천)',
      description: '팀 간의 종합 전력 점수 차이를 최소화하여 가장 박빙의 승부를 유도합니다.',
    },
    {
      mode: 'ROLE_MASTERY',
      name: '포지션 숙련도 우선',
      description: '모든 선수가 본인의 주력 포지션에 가깝게 배치되도록 비주력 배정을 최소화합니다.',
    },
    {
      mode: 'LANE_MATCHUP',
      name: '맞라이너 상대 격차 최소화',
      description: '탑 대 탑, 미드 대 미드 등 라인전 1:1 전력 격차가 크게 벌어지지 않도록 조정합니다.',
    },
  ];

  const plans: MultiTeamPlan[] = [];

  for (const { mode, name, description } of modes) {
    let current = baseAssignment.map((a) => ({ ...a }));
    let currentCost = evaluateAssignmentList(current, numTeams, mode);
    let best = current.map((a) => ({ ...a }));
    let bestCost = currentCost;

    // 반복 횟수: 2팀=600회, 4팀=1200회, 8/16팀=2000회 (빠른 응답 보장)
    const iterations = Math.min(Math.max(numTeams * 400, 600), 2500);
    let temp = 100.0;
    const coolingRate = 0.995;

    for (let i = 0; i < iterations; i += 1) {
      // 무작위로 같은 포지션의 두 선수를 스왑하거나, 다른 포지션의 선수를 스왑
      const idx1 = Math.floor(Math.random() * current.length);
      const idx2 = Math.floor(Math.random() * current.length);
      if (idx1 === idx2) continue;

      const a1 = current[idx1];
      const a2 = current[idx2];
      if (!a1 || !a2) continue;

      // 제약조건 위반 검사
      const p1FixedPos = constraints.pinnedPositions[a1.player.id];
      const p2FixedPos = constraints.pinnedPositions[a2.player.id];
      const p1FixedTeam = constraints.pinnedTeams[a1.player.id];
      const p2FixedTeam = constraints.pinnedTeams[a2.player.id];

      // a1의 선수 -> a2의 슬롯(teamIndex, position), a2의 선수 -> a1의 슬롯
      if (p1FixedPos && p1FixedPos !== a2.position) continue;
      if (p2FixedPos && p2FixedPos !== a1.position) continue;
      if (p1FixedTeam !== undefined && p1FixedTeam !== a2.teamIndex) continue;
      if (p2FixedTeam !== undefined && p2FixedTeam !== a1.teamIndex) continue;

      // 스왑 적용
      const stat1New = getPlayerPositionScore(a1.player, a2.position, ratings);
      const stat2New = getPlayerPositionScore(a2.player, a1.position, ratings);

      const candidate = current.map((item, idx) => {
        if (idx === idx1) {
          return {
            ...item,
            player: a2.player,
            ratingScore: stat2New.score,
            isMainPosition: stat2New.isMain,
          };
        }
        if (idx === idx2) {
          return {
            ...item,
            player: a1.player,
            ratingScore: stat1New.score,
            isMainPosition: stat1New.isMain,
          };
        }
        return item;
      });

      if (!satisfiesConstraints(candidate, constraints)) continue;

      const candidateCost = evaluateAssignmentList(candidate, numTeams, mode);
      const delta = candidateCost - currentCost;

      if (delta < 0 || Math.exp(-delta / temp) > Math.random()) {
        current = candidate;
        currentCost = candidateCost;
        if (currentCost < bestCost) {
          best = current.map((a) => ({ ...a }));
          bestCost = currentCost;
        }
      }

      temp *= coolingRate;
    }

    plans.push(buildPlanResult(name, description, best, numTeams, ratings));
  }

  return { plans };
}

// 수동으로 두 선수를 교환할 때 유효성 체크 및 실시간 재계산
export function swapMultiTeamPlayers(
  plan: MultiTeamPlan,
  firstPlayerId: string,
  secondPlayerId: string,
  ratings?: Record<string, PowerRating>,
  constraints: TeamConstraints = { pinnedPositions: {}, pinnedTeams: {}, pairedPlayers: [], isolatedPlayers: [] },
): MultiTeamPlan {
  const allAssignments = plan.teams.flatMap((t) => t.assignments);
  const a1 = allAssignments.find((a) => a.player.id === firstPlayerId);
  const a2 = allAssignments.find((a) => a.player.id === secondPlayerId);

  if (!a1 || !a2) return plan;

  const stat1New = getPlayerPositionScore(a1.player, a2.position, ratings);
  const stat2New = getPlayerPositionScore(a2.player, a1.position, ratings);

  const updatedAssignments = allAssignments.map((a) => {
    if (a.player.id === firstPlayerId) {
      return {
        ...a,
        player: a2.player,
        ratingScore: stat2New.score,
        isMainPosition: stat2New.isMain,
      };
    }
    if (a.player.id === secondPlayerId) {
      return {
        ...a,
        player: a1.player,
        ratingScore: stat1New.score,
        isMainPosition: stat1New.isMain,
      };
    }
    return a;
  });

  if (!satisfiesConstraints(updatedAssignments, constraints)) throw new MultiTeamBuildError('CONSTRAINT_VIOLATION', '이 교환은 팀·포지션 고정 또는 같은 팀 조건을 위반합니다.');
  return buildPlanResult(plan.name, plan.description, updatedAssignments, plan.teams.length, ratings);
}
