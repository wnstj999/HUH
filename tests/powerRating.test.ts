import { describe, expect, it } from 'vitest';
import { calculatePowerRating, type PlayerMatchRecord, type PlayerRankInfo } from '../server/lib/powerRating.js';

describe('HUH 설명 가능한 전력 추정치 모델 (calculatePowerRating)', () => {
  const baseRank: PlayerRankInfo = {
    inhouseTier: 'B',
    inhouseScore: 8,
    currentSoloTier: 'EMERALD',
    currentSoloDivision: 'II',
    currentSoloLp: 50,
    historicalSoloTier: 'DIAMOND',
    historicalSoloSeason: '2024',
    historicalFlexTier: 'GOLD',
  };

  const dummyMatches: PlayerMatchRecord[] = [
    {
      matchId: 'KR_1', queueId: 420, queueType: 'SOLO', championId: 103, championName: 'Ahri',
      position: 'MID', win: true, kills: 8, deaths: 2, assists: 9, cs: 220, goldEarned: 13000,
      damageToChampions: 25000, visionScore: 28, gameDuration: 1800, gameCreationAt: new Date().toISOString(),
    },
    {
      matchId: 'KR_2', queueId: 420, queueType: 'SOLO', championId: 103, championName: 'Ahri',
      position: 'MID', win: true, kills: 6, deaths: 3, assists: 7, cs: 210, goldEarned: 12500,
      damageToChampions: 22000, visionScore: 24, gameDuration: 1750, gameCreationAt: new Date().toISOString(),
    },
    {
      matchId: 'KR_3', queueId: 420, queueType: 'SOLO', championId: 238, championName: 'Zed',
      position: 'MID', win: false, kills: 5, deaths: 5, assists: 3, cs: 190, goldEarned: 10000,
      damageToChampions: 19000, visionScore: 18, gameDuration: 1600, gameCreationAt: new Date().toISOString(),
    },
    {
      matchId: 'KR_4', queueId: 420, queueType: 'SOLO', championId: 103, championName: 'Ahri',
      position: 'MID', win: true, kills: 9, deaths: 1, assists: 11, cs: 240, goldEarned: 14000,
      damageToChampions: 28000, visionScore: 30, gameDuration: 1900, gameCreationAt: new Date().toISOString(),
    },
    {
      matchId: 'KR_5', queueId: 420, queueType: 'SOLO', championId: 103, championName: 'Ahri',
      position: 'MID', win: true, kills: 7, deaths: 4, assists: 8, cs: 215, goldEarned: 12000,
      damageToChampions: 23000, visionScore: 22, gameDuration: 1820, gameCreationAt: new Date().toISOString(),
    },
  ];

  it('기본 티어 점수와 과거 최고 티어 감쇄 보정을 투명하게 산출한다', () => {
    const result = calculatePowerRating(baseRank, dummyMatches);

    // 에메랄드 2 + 50LP -> 2150 + 100 + 25 = 2275
    expect(result.breakdown.baseTierScore).toBe(2275);
    // 과거 다이아몬드(2400)과의 차이 (2400 - 2275 = 125)의 20% -> 25점 보정
    expect(result.breakdown.peakRankBonus).toBeGreaterThan(0);
    expect(result.breakdown.peakRankBonus).toBeLessThan(25);
    expect(result.breakdown.baseTierDescription).toContain('에메랄드');
    expect(result.breakdown.peakRankDescription).toContain('다이아몬드');
  });

  it('주 포지션과 미경험 포지션을 구분하여 포지션별 전력을 차등 평가한다', () => {
    const result = calculatePowerRating(baseRank, dummyMatches);

    // 5경기 모두 미드 플레이 -> 미드가 주 포지션
    expect(result.breakdown.roleMastery.MID.experienceLevel).toBe('MAIN');
    expect(result.midScore).toBeGreaterThan(result.topScore);
    expect(result.breakdown.roleMastery.TOP.experienceLevel).toBe('UNPLAYED');
    // 미경험 포지션은 주 포지션 대비 감쇄 적용
    expect(result.topScore).toBeLessThan(result.midScore);
  });

  it('표본 수에 따라 신뢰도 등급과 부족 사유를 명확히 표시한다', () => {
    // 5경기 -> MEDIUM 신뢰도
    const mediumResult = calculatePowerRating(baseRank, dummyMatches.map((m) => ({ ...m, gameCreationAt: '2026-09-13T00:00:00Z' })), Date.parse('2026-09-13T00:00:00Z'));
    expect(mediumResult.confidenceLevel).toBe('MEDIUM');

    // 0경기 -> LOW 신뢰도
    const lowResult = calculatePowerRating(baseRank, []);
    expect(lowResult.confidenceLevel).toBe('LOW');
    expect(lowResult.confidenceReason).toContain('전적 데이터 없음');
  });

  it('중복·오래된 경기·잘못된 수치는 표본과 신뢰도를 부풀리지 않는다', () => {
    const now = Date.parse(dummyMatches[0]!.gameCreationAt);
    const m = dummyMatches[0]!;
    const result = calculatePowerRating(baseRank, [m, m, { ...m, matchId: 'old', gameCreationAt: '2020-01-01' }, { ...m, matchId: 'bad', kills: NaN }], now);
    expect(result.sampleGamesCount).toBe(1);
    expect(result.confidenceLevel).toBe('LOW');
    expect(Math.abs(result.breakdown.recentPerformanceModifier)).toBeLessThan(5);
  });

  it('전적이 없으면 모든 포지션에 미경험 감점을 적용하지 않는다', () => {
    const result = calculatePowerRating(baseRank, []);
    expect(result.topScore).toBe(result.overallScore);
    expect(result.supScore).toBe(result.overallScore);
    expect(result.evaluatedPeriodDays).toBe(0);
  });

  it('동일 승패에서 KDA만 높다고 전력을 높이지 않는다', () => {
    const now = Date.parse(dummyMatches[0]!.gameCreationAt);
    const original = calculatePowerRating(baseRank, dummyMatches, now);
    const inflated = calculatePowerRating(baseRank, dummyMatches.map((m) => ({ ...m, kills: 100, deaths: 0 })), now);
    expect(inflated.overallScore).toBe(original.overallScore);
  });
});
