import type { BalancedTeams, Player, Position, Team, TeamAssignment } from '../types';

export const REQUIRED_POSITIONS: Position[] = ['TOP', 'JUG', 'MID', 'ADC', 'SUP'];

export class TeamBuildError extends Error {
  constructor(public readonly code: 'COUNT' | 'POSITION_SHORTAGE' | 'NO_ASSIGNMENT', message: string) {
    super(message);
  }
}

function eligible(player: Player, position: Position): boolean {
  return player.positions.includes(position);
}

function findPositionAssignment(players: Player[]): Map<Position, Player> | null {
  const result = new Map<Position, Player>();
  const remaining = new Set(players.map((player) => player.id));
  const orderedPositions = [...REQUIRED_POSITIONS].sort((left, right) =>
    players.filter((player) => eligible(player, left)).length - players.filter((player) => eligible(player, right)).length,
  );

  function visit(index: number): boolean {
    if (index === orderedPositions.length) return true;
    const position = orderedPositions[index];
    if (!position) return false;
    const candidates = players
      .filter((player) => remaining.has(player.id) && eligible(player, position))
      .sort((a, b) => a.positions.length - b.positions.length || a.displayName.localeCompare(b.displayName));
    for (const player of candidates) {
      remaining.delete(player.id);
      result.set(position, player);
      if (visit(index + 1)) return true;
      result.delete(position);
      remaining.add(player.id);
    }
    return false;
  }

  return visit(0) ? result : null;
}

function assignmentsFor(team: Team, map: Map<Position, Player>): TeamAssignment[] {
  return REQUIRED_POSITIONS.map((position) => ({ team, position, player: map.get(position)! }));
}

export function buildBalancedTeams(players: Player[]): BalancedTeams {
  if (players.length !== 10) throw new TeamBuildError('COUNT', '내전 참가자는 정확히 10명이어야 합니다.');
  for (const position of REQUIRED_POSITIONS) {
    const count = players.filter((player) => eligible(player, position)).length;
    if (count < 2) {
      const message = count === 0
        ? `${position} 가능 플레이어가 없습니다.`
        : `${position} 가능 플레이어가 1명뿐이라 두 팀을 구성할 수 없습니다.`;
      throw new TeamBuildError('POSITION_SHORTAGE', message);
    }
  }

  let best: BalancedTeams | null = null;
  const first = players[0];
  if (!first) throw new TeamBuildError('COUNT', '내전 참가자는 정확히 10명이어야 합니다.');
  const anchor: Player = first;
  const rest = players.slice(1);

  function choose(start: number, picked: Player[]): void {
    if (picked.length === 4) {
      const bluePlayers = [anchor, ...picked];
      const blueIds = new Set(bluePlayers.map((player) => player.id));
      const redPlayers = players.filter((player) => !blueIds.has(player.id));
      const blueMap = findPositionAssignment(bluePlayers);
      if (!blueMap) return;
      const redMap = findPositionAssignment(redPlayers);
      if (!redMap) return;
      const blueScore = bluePlayers.reduce((sum, player) => sum + player.inhouseScore, 0);
      const redScore = redPlayers.reduce((sum, player) => sum + player.inhouseScore, 0);
      const candidate: BalancedTeams = {
        assignments: [...assignmentsFor('BLUE', blueMap), ...assignmentsFor('RED', redMap)],
        blueScore,
        redScore,
        difference: Math.abs(blueScore - redScore),
      };
      if (!best || candidate.difference < best.difference) best = candidate;
      return;
    }
    for (let index = start; index <= rest.length - (4 - picked.length); index += 1) {
      const player = rest[index];
      if (!player) continue;
      choose(index + 1, [...picked, player]);
    }
  }

  choose(0, []);
  if (!best) throw new TeamBuildError('NO_ASSIGNMENT', '선택한 10명으로 양 팀의 모든 포지션을 채울 수 없습니다.');
  return best;
}

export function swapAssignments(assignments: TeamAssignment[], firstPlayerId: string, secondPlayerId: string): TeamAssignment[] {
  const first = assignments.find((assignment) => assignment.player.id === firstPlayerId);
  const second = assignments.find((assignment) => assignment.player.id === secondPlayerId);
  if (!first || !second) return assignments;
  if (!eligible(first.player, second.position) || !eligible(second.player, first.position)) {
    throw new TeamBuildError('NO_ASSIGNMENT', '두 플레이어가 상대 슬롯의 포지션을 수행할 수 없습니다.');
  }
  return assignments.map((assignment) => {
    if (assignment.player.id === firstPlayerId) return { ...assignment, player: second.player };
    if (assignment.player.id === secondPlayerId) return { ...assignment, player: first.player };
    return assignment;
  });
}
