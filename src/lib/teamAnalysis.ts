import type { CustomTeam, CustomTeamMember, Position, PowerRating } from '../types';
import { POSITIONS } from './multiTeamBalancer';

export interface LaneComparison {
  position: Position;
  team1Member: CustomTeamMember | null;
  team2Member: CustomTeamMember | null;
  team1Score: number;
  team2Score: number;
  scoreDifference: number;
  advantageTeam: 1 | 2 | 0; // 0: 동등, 1: team1 우세, 2: team2 우세
  severity: 'BALANCED' | 'MODERATE' | 'SEVERE'; // 차이가 150 이상이면 MODERATE, 300 이상이면 SEVERE
}

export interface TeamPowerAnalysis {
  teamId: string;
  teamName: string;
  totalScore: number;
  averageScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReasons: string[];
  positions: Record<Position, {
    member: CustomTeamMember | null;
    score: number;
    isMainRole: boolean;
  }>;
}

export interface TradeSuggestion {
  team1Id: string;
  team1Name: string;
  team2Id: string;
  team2Name: string;
  position: Position;
  team1Player: string;
  team2Player: string;
  currentDifference: number;
  improvedDifference: number;
  differenceReduction: number;
}

export function parseMultiLineRiotIds(text: string): Array<{ riotId: string; gameName: string; tagLine: string; position?: Position }> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const results: Array<{ riotId: string; gameName: string; tagLine: string; position?: Position }> = [];

  for (const line of lines) {
    // 쉼표나 탭, 공백 등으로 분리되어 있을 수 있음
    // 예: "페이커#KR1" 또는 "MID 페이커#KR1" 또는 "페이커#KR1, TOP"
    let pos: Position | undefined = undefined;
    for (const p of POSITIONS) {
      const regex = new RegExp(`\\b${p}\\b`, 'i');
      if (regex.test(line)) {
        pos = p;
        break;
      }
    }

    const cleanLine = line.replace(/^(TOP|JUG|MID|ADC|SUP|탑|정글|미드|원딜|서폿)[\s:,]+/i, '')
      .replace(/[\s:,]+(TOP|JUG|MID|ADC|SUP|탑|정글|미드|원딜|서폿)$/i, '')
      .trim();

    const hashIndex = cleanLine.lastIndexOf('#');
    if (hashIndex > 0) {
      const gameName = cleanLine.slice(0, hashIndex).trim();
      const tagLine = cleanLine.slice(hashIndex + 1).trim();
      results.push({
        riotId: `${gameName}#${tagLine}`,
        gameName,
        tagLine,
        position: pos,
      });
    } else if (cleanLine) {
      results.push({
        riotId: cleanLine,
        gameName: cleanLine,
        tagLine: 'KR1',
        position: pos,
      });
    }
  }

  return results;
}

export function evaluateTeamPower(
  team: CustomTeam,
  ratings?: Record<string, PowerRating>,
): TeamPowerAnalysis {
  let totalScore = 0;
  const reasons: string[] = [];
  let lowCount = 0;

  const positionsObj: TeamPowerAnalysis['positions'] = {
    TOP: { member: null, score: 1400, isMainRole: false },
    JUG: { member: null, score: 1400, isMainRole: false },
    MID: { member: null, score: 1400, isMainRole: false },
    ADC: { member: null, score: 1400, isMainRole: false },
    SUP: { member: null, score: 1400, isMainRole: false },
  };

  for (const pos of POSITIONS) {
    const member = team.members.find((m) => m.position === pos) || null;
    let score = 1400;
    let isMain = false;

    if (member) {
      const pId = member.playerId;
      const rating = pId && ratings ? ratings[pId] : null;

      if (rating) {
        const posScoreKey = `${pos.toLowerCase()}Score` as keyof PowerRating;
        score = Number(rating[posScoreKey] ?? rating.overallScore ?? 1500);
        const posGamesKey = `${pos.toLowerCase()}Games` as keyof PowerRating;
        isMain = Number(rating[posGamesKey] ?? 0) >= 5;
        if (rating.confidenceLevel === 'LOW') lowCount += 1;
      } else if (member.player) {
        const base = 1000 + ((member.player.inhouseScore || 7) - 4) * 100;
        score = base;
        lowCount += 1;
      } else {
        score = 1400;
        lowCount += 1;
      }
    } else {
      reasons.push(`${pos} 포지션 공석`);
      lowCount += 1;
    }

    positionsObj[pos] = {
      member,
      score,
      isMainRole: isMain,
    };
    totalScore += score;
  }

  let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
  if (lowCount >= 3 || team.members.length < 5) {
    confidence = 'LOW';
    reasons.push('팀원의 전적 데이터 표본이 부족하거나 인원이 미완성입니다.');
  } else if (lowCount >= 1) {
    confidence = 'MEDIUM';
    reasons.push('일부 팀원의 전적 지표가 적어 추정치가 보정되었습니다.');
  }

  return {
    teamId: team.id,
    teamName: team.name,
    totalScore,
    averageScore: Math.round(totalScore / 5),
    confidence,
    confidenceReasons: reasons,
    positions: positionsObj,
  };
}

// 두 팀 간 라인별 전력 상세 비교
export function compareTwoTeams(
  team1: CustomTeam,
  team2: CustomTeam,
  ratings?: Record<string, PowerRating>,
): {
  team1Analysis: TeamPowerAnalysis;
  team2Analysis: TeamPowerAnalysis;
  laneComparisons: LaneComparison[];
  totalScoreDiff: number;
} {
  const a1 = evaluateTeamPower(team1, ratings);
  const a2 = evaluateTeamPower(team2, ratings);

  const laneComparisons: LaneComparison[] = POSITIONS.map((pos) => {
    const s1 = a1.positions[pos].score;
    const s2 = a2.positions[pos].score;
    const diff = Math.abs(s1 - s2);
    const adv: 1 | 2 | 0 = s1 > s2 + 30 ? 1 : s2 > s1 + 30 ? 2 : 0;
    const severity = diff >= 300 ? 'SEVERE' : diff >= 150 ? 'MODERATE' : 'BALANCED';

    return {
      position: pos,
      team1Member: a1.positions[pos].member,
      team2Member: a2.positions[pos].member,
      team1Score: s1,
      team2Score: s2,
      scoreDifference: diff,
      advantageTeam: adv,
      severity,
    };
  });

  return {
    team1Analysis: a1,
    team2Analysis: a2,
    laneComparisons,
    totalScoreDiff: Math.abs(a1.totalScore - a2.totalScore),
  };
}

// 팀 간 밸런스를 개선할 수 있는 트레이드 제안 (같은 포지션끼리 교환)
export function suggestTrades(
  team1: CustomTeam,
  team2: CustomTeam,
  ratings?: Record<string, PowerRating>,
): TradeSuggestion[] {
  const currentDiff = Math.abs(
    evaluateTeamPower(team1, ratings).totalScore - evaluateTeamPower(team2, ratings).totalScore,
  );
  if (currentDiff < 80) return []; // 이미 거의 대등한 경우 제안 생략

  const suggestions: TradeSuggestion[] = [];

  for (const pos of POSITIONS) {
    const m1 = team1.members.find((m) => m.position === pos);
    const m2 = team2.members.find((m) => m.position === pos);
    if (!m1 || !m2) continue;

    // 만약 둘 다 주장(isCaptain)이거나 고정 조건이 있다면 제외 가능
    if (m1.isCaptain || m2.isCaptain) continue;

    // 임시로 두 선수를 교환해본 팀 구성 시뮬레이션
    const simTeam1: CustomTeam = {
      ...team1,
      members: team1.members.map((m) => (m.position === pos ? { ...m2, position: pos } : m)),
    };
    const simTeam2: CustomTeam = {
      ...team2,
      members: team2.members.map((m) => (m.position === pos ? { ...m1, position: pos } : m)),
    };

    const newDiff = Math.abs(
      evaluateTeamPower(simTeam1, ratings).totalScore - evaluateTeamPower(simTeam2, ratings).totalScore,
    );

    if (newDiff < currentDiff - 40) {
      suggestions.push({
        team1Id: team1.id,
        team1Name: team1.name,
        team2Id: team2.id,
        team2Name: team2.name,
        position: pos,
        team1Player: m1.playerName || m1.riotId,
        team2Player: m2.playerName || m2.riotId,
        currentDifference: currentDiff,
        improvedDifference: newDiff,
        differenceReduction: currentDiff - newDiff,
      });
    }
  }

  return suggestions.sort((a, b) => b.differenceReduction - a.differenceReduction);
}
