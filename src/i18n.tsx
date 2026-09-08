/* eslint-disable react-refresh/only-export-components -- provider and hook intentionally share one context module */
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import type { Language } from './types';

const messages = {
  ko: {
    dashboard: '대시보드', players: '플레이어', builder: '내전 생성', history: '내전 전적', stats: '개인 통계', settings: '설정', privacy: '개인정보 처리방침', terms: '이용약관',
    registered: '등록 인원', participating: '오늘 참가', matches: '내전 수', apiStatus: 'Riot API', recentMatches: '최근 경기', refresh: '새로고침', loading: '불러오는 중…', noData: '데이터 없음',
    addPlayer: '플레이어 추가', editPlayer: '플레이어 수정', name: '이름', inhouseTier: '내전 티어', riotId: 'Riot ID', score: '점수', positions: '포지션', currentSolo: '현재 솔랭', historicalSolo: '과거 솔랭 최고', historicalFlex: '과거 자랭 최고', today: '오늘 참가', updated: '최근 갱신', note: '비고', actions: '관리', save: '저장', cancel: '취소', deactivate: '비활성화', edit: '수정', rankRefresh: 'Riot 데이터 갱신', refreshAll: '전체 새로고침', search: '이름 또는 Riot ID 검색', allTiers: '전체 티어', allPositions: '전체 포지션', participatingOnly: '참가자만 보기', inactive: '비활성', active: '활성',
    selectTen: '오늘 참가자 중 정확히 10명을 선택하세요.', selected: '선택', autoBuild: '자동 팀 생성', saveMatch: '경기 저장', manualHint: '자동 편성 후 각 슬롯의 선수를 바꿔 수동 조정할 수 있습니다.', blue: 'BLUE', red: 'RED', total: '총점', difference: '점수 차이', eventName: '내전 이름', eventPlaceholder: '9월 정기 내전', positionError: '포지션 구성을 만들 수 없습니다.',
    match: '경기', date: '날짜', winner: '승리팀', duration: '시간', status: '상태', ready: '대기', inProgress: '진행 중', completed: '완료', cancelled: '취소', details: '상세', tournamentWaiting: '권한 대기',
    totalGames: '총 경기', wins: '승', losses: '패', winRate: '승률', avgKda: '평균 KDA', avgCs: '평균 CS', avgDamage: '평균 딜량', byPosition: '포지션별 경기', recent: '최근 경기', champions: '자주 한 챔피언', selectPlayer: '플레이어 선택',
    riotApiKey: 'Riot API Key', accessKey: '운영 접근 키', testConnection: '연결 테스트', saveSession: '현재 세션에 저장', rememberBrowser: '이 브라우저에서 기억하기', connected: '연결됨', notConfigured: '미설정', enabled: '활성', disabled: '비활성', backend: 'Backend', database: 'Database', opgg: 'OP.GG', tournamentApi: 'Tournament API', keySecurity: '키는 저장소나 번들에 포함되지 않으며 선택한 브라우저 저장소에만 보관됩니다.',
    privacyTitle: '개인정보 처리방침', termsTitle: '이용약관', lastUpdated: '최종 갱신: 2026년 9월 8일',
    error: '오류', retry: '다시 시도', emptyPlayers: '등록된 플레이어가 없습니다.', emptyMatches: '저장된 내전 경기가 없습니다.', keyMissing: 'Settings에서 Riot API Key를 먼저 저장하세요.',
    footer: '이 프로젝트는 Riot Games의 공식 서비스 또는 승인된 프로젝트가 아니며 Riot Games의 공식 의견을 나타내지 않습니다.',
  },
  en: {
    dashboard: 'Dashboard', players: 'Players', builder: 'Match Builder', history: 'Match History', stats: 'Player Stats', settings: 'Settings', privacy: 'Privacy Policy', terms: 'Terms of Service',
    registered: 'Registered', participating: 'Playing Today', matches: 'Matches', apiStatus: 'Riot API', recentMatches: 'Recent Matches', refresh: 'Refresh', loading: 'Loading…', noData: 'No data',
    addPlayer: 'Add Player', editPlayer: 'Edit Player', name: 'Name', inhouseTier: 'Inhouse Tier', riotId: 'Riot ID', score: 'Score', positions: 'Positions', currentSolo: 'Current Solo', historicalSolo: 'Solo Peak', historicalFlex: 'Flex Peak', today: 'Playing Today', updated: 'Last Updated', note: 'Note', actions: 'Actions', save: 'Save', cancel: 'Cancel', deactivate: 'Deactivate', edit: 'Edit', rankRefresh: 'Refresh Riot Data', refreshAll: 'Refresh All', search: 'Search name or Riot ID', allTiers: 'All tiers', allPositions: 'All positions', participatingOnly: 'Playing only', inactive: 'Inactive', active: 'Active',
    selectTen: 'Select exactly 10 players who are playing today.', selected: 'Selected', autoBuild: 'Build Balanced Teams', saveMatch: 'Save Match', manualHint: 'After auto-building, swap players between slots for manual adjustment.', blue: 'BLUE', red: 'RED', total: 'Total', difference: 'Score difference', eventName: 'Event name', eventPlaceholder: 'September Inhouse', positionError: 'No valid position assignment exists.',
    match: 'Match', date: 'Date', winner: 'Winner', duration: 'Duration', status: 'Status', ready: 'Ready', inProgress: 'In progress', completed: 'Completed', cancelled: 'Cancelled', details: 'Details', tournamentWaiting: 'Awaiting access',
    totalGames: 'Games', wins: 'Wins', losses: 'Losses', winRate: 'Win rate', avgKda: 'Average KDA', avgCs: 'Average CS', avgDamage: 'Average damage', byPosition: 'Games by position', recent: 'Recent matches', champions: 'Most played champions', selectPlayer: 'Select player',
    riotApiKey: 'Riot API Key', accessKey: 'Operations access key', testConnection: 'Test connection', saveSession: 'Save in this session', rememberBrowser: 'Remember in this browser', connected: 'Connected', notConfigured: 'Not configured', enabled: 'Enabled', disabled: 'Disabled', backend: 'Backend', database: 'Database', opgg: 'OP.GG', tournamentApi: 'Tournament API', keySecurity: 'Keys are never included in the repository or bundle and remain only in the selected browser storage.',
    privacyTitle: 'Privacy Policy', termsTitle: 'Terms of Service', lastUpdated: 'Last updated: September 8, 2026',
    error: 'Error', retry: 'Retry', emptyPlayers: 'No players have been registered.', emptyMatches: 'No inhouse matches have been saved.', keyMissing: 'Save a Riot API Key in Settings first.',
    footer: 'This project is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties.',
  },
} as const;

const apiErrors = {
  ko: {
    ACCESS_DENIED: '운영 접근 키가 올바르지 않습니다.', DATABASE_NOT_CONFIGURED: 'Database 환경변수가 설정되지 않았습니다.', DATABASE_ERROR: 'Database 요청을 처리하지 못했습니다.', DUPLICATE: '같은 Riot ID 또는 PUUID가 이미 등록되어 있습니다.', NOT_FOUND: '데이터를 찾을 수 없습니다.',
    INVALID_RIOT_ID: 'Riot ID는 GameName#TagLine 형식이어야 합니다.', INVALID_BODY: 'JSON 요청 본문이 필요합니다.', INVALID_TIER: '올바른 내전 티어를 선택하세요.', INVALID_POSITIONS: '하나 이상의 올바른 포지션을 선택하세요.', NAME_REQUIRED: '이름을 입력하세요.', EVENT_NAME_REQUIRED: '내전 이름을 입력하세요.',
    RIOT_KEY_MISSING: 'Riot API Key가 설정되지 않았습니다.', RIOT_UNAUTHORIZED: 'Riot API Key 인증 오류입니다.', RIOT_FORBIDDEN: 'Riot API Key가 만료되었거나 접근 권한이 없습니다.', RIOT_NOT_FOUND: 'Riot ID를 찾을 수 없습니다.', RIOT_RATE_LIMIT: 'Riot API 요청 제한에 도달했습니다. 잠시 후 다시 시도하세요.', RIOT_ERROR: 'Riot API 요청이 실패했습니다.',
    OPGG_DISABLED: 'OP.GG 조회가 비활성화되어 있습니다.', OPGG_NOT_FOUND: 'OP.GG 프로필을 찾을 수 없습니다.', OPGG_PARSE_FAILED: 'OP.GG 과거 시즌 기록 구조를 확인할 수 없습니다.', OPGG_REQUEST_FAILED: 'OP.GG 요청이 실패했습니다.', ORIGIN_NOT_ALLOWED: '허용되지 않은 요청 Origin입니다.', METHOD_NOT_ALLOWED: '지원하지 않는 요청 방식입니다.', INTERNAL_ERROR: '서버 요청을 처리하지 못했습니다.',
  },
  en: {
    ACCESS_DENIED: 'The operations access key is incorrect.', DATABASE_NOT_CONFIGURED: 'Database environment variables are not configured.', DATABASE_ERROR: 'The database request could not be completed.', DUPLICATE: 'The same Riot ID or PUUID is already registered.', NOT_FOUND: 'The requested data was not found.',
    INVALID_RIOT_ID: 'Riot ID must use the GameName#TagLine format.', INVALID_BODY: 'A JSON request body is required.', INVALID_TIER: 'Select a valid inhouse tier.', INVALID_POSITIONS: 'Select at least one valid position.', NAME_REQUIRED: 'Enter a name.', EVENT_NAME_REQUIRED: 'Enter an event name.',
    RIOT_KEY_MISSING: 'A Riot API Key has not been configured.', RIOT_UNAUTHORIZED: 'Riot API Key authentication failed.', RIOT_FORBIDDEN: 'The Riot API Key is expired or lacks permission.', RIOT_NOT_FOUND: 'The Riot ID was not found.', RIOT_RATE_LIMIT: 'The Riot API rate limit was reached. Try again later.', RIOT_ERROR: 'The Riot API request failed.',
    OPGG_DISABLED: 'OP.GG lookup is disabled.', OPGG_NOT_FOUND: 'The OP.GG profile was not found.', OPGG_PARSE_FAILED: 'The OP.GG season history structure could not be parsed.', OPGG_REQUEST_FAILED: 'The OP.GG request failed.', ORIGIN_NOT_ALLOWED: 'This request origin is not allowed.', METHOD_NOT_ALLOWED: 'This request method is not supported.', INTERNAL_ERROR: 'The server could not complete the request.',
  },
} as const;

export function translateApiError(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  const language = localStorage.getItem('huh.language') === 'en' ? 'en' : 'ko';
  return apiErrors[language][code as keyof typeof apiErrors.ko] ?? fallback;
}

export type MessageKey = keyof typeof messages.ko;
interface I18nValue { language: Language; setLanguage: (language: Language) => void; t: (key: MessageKey) => string }
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<Language>(() => localStorage.getItem('huh.language') === 'en' ? 'en' : 'ko');
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const value = useMemo<I18nValue>(() => ({
    language,
    setLanguage(next) { localStorage.setItem('huh.language', next); document.documentElement.lang = next; setLanguageState(next); },
    t: (key) => messages[language][key],
  }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('I18nProvider is missing');
  return value;
}
