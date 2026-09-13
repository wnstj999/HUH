// server/lib/powerRating.ts
// HUH 자체 전력 추정치 모델 (v1.0)
// 설명 가능하고 투명한 산출 근거를 제공하며, 포지션별 불이익(서포터 등)을 방지합니다.

export interface PlayerMatchRecord {
  matchId: string;
  queueId: number;
  queueType: 'SOLO' | 'FLEX' | 'NORMAL';
  championId: number;
  championName: string;
  position: 'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP' | 'UNKNOWN';
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  goldEarned: number;
  damageToChampions: number;
  visionScore: number;
  gameDuration: number; // seconds
  gameCreationAt: string;
}

export interface PlayerRankInfo {
  inhouseTier: string; // TR, GR, LR, UR, SR, S, A, B, C, D, F, FF
  inhouseScore: number;
  currentSoloTier: string | null;
  currentSoloDivision: string | null;
  currentSoloLp: number | null;
  historicalSoloTier: string | null;
  historicalSoloSeason: string | null;
  historicalFlexTier: string | null;
}

export interface ScoreBreakdown {
  baseTierScore: number;
  baseTierDescription: string;
  peakRankBonus: number;
  peakRankDescription: string;
  recentPerformanceModifier: number;
  recentPerformanceDescription: string;
  metrics: {
    sampleGames: number;
    winRate: number;
    avgKda: number;
    avgCsPerMin: number;
    avgDpm: number;
    avgGpm: number;
    avgVisionScore: number;
  };
  roleMastery: Record<'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP', {
    games: number;
    winRate: number;
    masteryScore: number;
    experienceLevel: 'MAIN' | 'SECONDARY' | 'OFF_ROLE' | 'UNPLAYED';
  }>;
}

export interface EvaluatedPowerRating {
  overallScore: number;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReason: string;
  sampleGamesCount: number;
  evaluatedPeriodDays: number;
  topScore: number;
  jugScore: number;
  midScore: number;
  adcScore: number;
  supScore: number;
  topGames: number;
  jugGames: number;
  midGames: number;
  adcGames: number;
  supGames: number;
  breakdown: ScoreBreakdown;
  modelVersion: string;
}

const TIER_BASE_POINTS: Record<string, number> = {
  IRON: 1000,
  BRONZE: 1200,
  SILVER: 1400,
  GOLD: 1650,
  PLATINUM: 1900,
  EMERALD: 2150,
  DIAMOND: 2400,
  MASTER: 2650,
  GRANDMASTER: 2800,
  CHALLENGER: 2950,
};


export const TIER_KR_NAMES: Record<string, string> = {
  IRON: '아이언',
  BRONZE: '브론즈',
  SILVER: '실버',
  GOLD: '골드',
  PLATINUM: '플래티넘',
  EMERALD: '에메랄드',
  DIAMOND: '다이아몬드',
  MASTER: '마스터',
  GRANDMASTER: '그랜드마스터',
  CHALLENGER: '챌린저',
};

const DIVISION_POINTS: Record<string, number> = {
  IV: 0,
  '4': 0,
  III: 50,
  '3': 50,
  II: 100,
  '2': 100,
  I: 150,
  '1': 150,
};

export function normalizePosition(riotPos: string): 'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP' | 'UNKNOWN' {
  const upper = (riotPos || '').toUpperCase();
  if (upper === 'TOP') return 'TOP';
  if (upper === 'JUNGLE' || upper === 'JUG') return 'JUG';
  if (upper === 'MIDDLE' || upper === 'MID') return 'MID';
  if (upper === 'BOTTOM' || upper === 'ADC') return 'ADC';
  if (upper === 'UTILITY' || upper === 'SUP') return 'SUP';
  return 'UNKNOWN';
}

export function calculatePowerRating(
  rankInfo: PlayerRankInfo,
  matches: PlayerMatchRecord[],
): EvaluatedPowerRating {
  const modelVersion = 'huh-v1.0';

  // 1. 기본 티어 점수 산출
  let baseScore = 1500;
  let baseDesc = '';

  const soloTier = rankInfo.currentSoloTier?.toUpperCase();
  if (soloTier && TIER_BASE_POINTS[soloTier]) {
    const div = rankInfo.currentSoloDivision ? DIVISION_POINTS[rankInfo.currentSoloDivision] ?? 50 : 50;
    const lp = rankInfo.currentSoloLp ? Math.min(Math.max(rankInfo.currentSoloLp, 0), 100) : 0;
    baseScore = TIER_BASE_POINTS[soloTier] + div + Math.round(lp * 0.5);
    const krName = TIER_KR_NAMES[soloTier] || soloTier;
    baseDesc = `현재 솔로랭크 ${krName}(${soloTier}) ${rankInfo.currentSoloDivision ?? ''} (${baseScore}점)`;
  } else if (rankInfo.historicalFlexTier && TIER_BASE_POINTS[rankInfo.historicalFlexTier.toUpperCase()]) {
    const flexTier = rankInfo.historicalFlexTier.toUpperCase();
    baseScore = (TIER_BASE_POINTS[flexTier] || 1500) - 50; // 자랭은 솔랭 대비 약간 보정
    const krName = TIER_KR_NAMES[flexTier] || flexTier;
    baseDesc = `자유랭크 기록 ${krName}(${flexTier}) 기준 산출 (${baseScore}점)`;
  } else {
    // 기존 커뮤니티 내전 점수 매핑 (4~15 -> 1000~2100)
    const score = rankInfo.inhouseScore || 7;
    baseScore = 1000 + (score - 4) * 100;
    baseDesc = `내전 기본 등급 ${rankInfo.inhouseTier || 'C'} 기준 초기값 (${baseScore}점)`;
  }

  // 2. 과거 최고 티어 보정 (오래된 기록일수록 감쇄)
  let peakBonus = 0;
  let peakDesc = '과거 최고 기록 추가 반영 없음';
  if (rankInfo.historicalSoloTier) {
    const historicalTier = rankInfo.historicalSoloTier.toUpperCase();
    const historicalPoints = TIER_BASE_POINTS[historicalTier] ?? 0;
    if (historicalPoints > baseScore) {
      // 과거 기록이 현재보다 높을 때, 과거 영향력은 차이의 20%로 제한 (최대 120점)
      peakBonus = Math.min(Math.round((historicalPoints - baseScore) * 0.2), 120);
      const krName = TIER_KR_NAMES[historicalTier] || historicalTier;
      peakDesc = `과거 최고 솔로랭크 ${krName}(${historicalTier}) 달성 이력 감쇄 반영 (+${peakBonus}점)`;
    }
  }

  // 3. 최근 경기 지표 분석 (최근 100경기 이내 유효 데이터)
  const validMatches = matches.filter((m) => m.gameDuration >= 480); // 8분 이상 정상 경기만
  const sampleCount = validMatches.length;

  let winRate = 0;
  let avgKda = 0;
  let avgCsPerMin = 0;
  let avgDpm = 0;
  let avgGpm = 0;
  let avgVisionScore = 0;
  let recentPerfMod = 0;
  let recentPerfDesc = '최근 전적 데이터 부족으로 보정 미적용';

  if (sampleCount > 0) {
    const wins = validMatches.filter((m) => m.win).length;
    winRate = Math.round((wins / sampleCount) * 100);

    const totalKills = validMatches.reduce((acc, m) => acc + m.kills, 0);
    const totalDeaths = validMatches.reduce((acc, m) => acc + m.deaths, 0);
    const totalAssists = validMatches.reduce((acc, m) => acc + m.assists, 0);
    avgKda = Number(((totalKills + totalAssists) / Math.max(1, totalDeaths)).toFixed(2));

    const totalMinutes = validMatches.reduce((acc, m) => acc + Math.max(1, m.gameDuration / 60), 0);
    avgCsPerMin = Number((validMatches.reduce((acc, m) => acc + m.cs, 0) / totalMinutes).toFixed(1));
    avgDpm = Math.round(validMatches.reduce((acc, m) => acc + m.damageToChampions, 0) / totalMinutes);
    avgGpm = Math.round(validMatches.reduce((acc, m) => acc + m.goldEarned, 0) / totalMinutes);
    avgVisionScore = Number((validMatches.reduce((acc, m) => acc + m.visionScore, 0) / sampleCount).toFixed(1));

    // 최근 승률 보정 (-40 ~ +40)
    const winRateMod = Math.round((winRate - 50) * 0.8);
    // KDA 보정 (기준 2.5, -30 ~ +30)
    const kdaMod = Math.min(Math.max(Math.round((avgKda - 2.5) * 15), -30), 30);

    // 표본 수 가중치 (표본이 적으면 보정치 축소)
    const sampleWeight = Math.min(sampleCount / 20, 1.0);
    recentPerfMod = Math.round((winRateMod + kdaMod) * sampleWeight);
    recentPerfDesc = `최근 ${sampleCount}전 승률 ${winRate}%, KDA ${avgKda} 반영 (${recentPerfMod >= 0 ? '+' : ''}${recentPerfMod}점)`;
  }

  const overallScore = Math.round(baseScore + peakBonus + recentPerfMod);

  // 4. 포지션별 숙련도 및 점수 계산
  const positions: Array<'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP'> = ['TOP', 'JUG', 'MID', 'ADC', 'SUP'];
  const roleMastery: ScoreBreakdown['roleMastery'] = {
    TOP: { games: 0, winRate: 0, masteryScore: 0, experienceLevel: 'UNPLAYED' },
    JUG: { games: 0, winRate: 0, masteryScore: 0, experienceLevel: 'UNPLAYED' },
    MID: { games: 0, winRate: 0, masteryScore: 0, experienceLevel: 'UNPLAYED' },
    ADC: { games: 0, winRate: 0, masteryScore: 0, experienceLevel: 'UNPLAYED' },
    SUP: { games: 0, winRate: 0, masteryScore: 0, experienceLevel: 'UNPLAYED' },
  };

  const posScores: Record<'TOP' | 'JUG' | 'MID' | 'ADC' | 'SUP', number> = {
    TOP: overallScore,
    JUG: overallScore,
    MID: overallScore,
    ADC: overallScore,
    SUP: overallScore,
  };

  for (const pos of positions) {
    const posMatches = validMatches.filter((m) => m.position === pos);
    const count = posMatches.length;
    const pWin = count > 0 ? Math.round((posMatches.filter((m) => m.win).length / count) * 100) : 0;
    const ratio = sampleCount > 0 ? count / sampleCount : 0;

    let level: 'MAIN' | 'SECONDARY' | 'OFF_ROLE' | 'UNPLAYED' = 'UNPLAYED';
    let multiplier = 0.85; // 기본 비숙련/미경험 감쇄

    if (count === 0) {
      level = 'UNPLAYED';
      multiplier = 0.85;
    } else if (ratio >= 0.45 || count >= 10) {
      level = 'MAIN';
      multiplier = 1.0;
    } else if (ratio >= 0.2 || count >= 5) {
      level = 'SECONDARY';
      multiplier = 0.95;
    } else {
      level = 'OFF_ROLE';
      multiplier = 0.90;
    }

    // 포지션별 승률 추가 가감 (판수가 3회 이상일 때)
    const winBonus = count >= 3 ? Math.round((pWin - 50) * 0.4) : 0;
    const pScore = Math.round(overallScore * multiplier + winBonus);

    roleMastery[pos] = {
      games: count,
      winRate: pWin,
      masteryScore: pScore,
      experienceLevel: level,
    };
    posScores[pos] = pScore;
  }

  // 5. 신뢰도 판정 및 부족 사유 명시
  let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  const reasons: string[] = [];

  if (sampleCount >= 20 && soloTier) {
    confidenceLevel = 'HIGH';
    reasons.push(`최근 ${sampleCount}전 및 솔로랭크 티어 확보`);
  } else if (sampleCount >= 5) {
    confidenceLevel = 'MEDIUM';
    if (!soloTier) reasons.push('현재 솔로랭크 정보 없음');
    reasons.push(`최근 경기 수 ${sampleCount}건`);
  } else {
    confidenceLevel = 'LOW';
    if (sampleCount === 0) {
      reasons.push('수집된 일반/랭크 전적 데이터 없음');
    } else {
      reasons.push(`최근 경기 표본 부족 (${sampleCount}건)`);
    }
    if (!soloTier) reasons.push('공식 랭크 데이터 없음');
  }

  const breakdown: ScoreBreakdown = {
    baseTierScore: baseScore,
    baseTierDescription: baseDesc,
    peakRankBonus: peakBonus,
    peakRankDescription: peakDesc,
    recentPerformanceModifier: recentPerfMod,
    recentPerformanceDescription: recentPerfDesc,
    metrics: {
      sampleGames: sampleCount,
      winRate,
      avgKda,
      avgCsPerMin,
      avgDpm,
      avgGpm,
      avgVisionScore,
    },
    roleMastery,
  };

  return {
    overallScore,
    confidenceLevel,
    confidenceReason: reasons.join(', '),
    sampleGamesCount: sampleCount,
    evaluatedPeriodDays: 30,
    topScore: posScores.TOP,
    jugScore: posScores.JUG,
    midScore: posScores.MID,
    adcScore: posScores.ADC,
    supScore: posScores.SUP,
    topGames: roleMastery.TOP.games,
    jugGames: roleMastery.JUG.games,
    midGames: roleMastery.MID.games,
    adcGames: roleMastery.ADC.games,
    supGames: roleMastery.SUP.games,
    breakdown,
    modelVersion,
  };
}
