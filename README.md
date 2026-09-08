# HUH — League of Legends 내전 관리

40명 이상이 참여하는 비공개 League of Legends 커뮤니티를 위한 실제 운영 애플리케이션입니다. GitHub Pages의 React 화면, Vercel Functions 백엔드, Supabase PostgreSQL 데이터베이스로 구성됩니다.

## 실제 아키텍처

```text
GitHub Pages (React + TypeScript, /HUH/)
  └─ HTTPS + CORS → Vercel Functions (/api/*)
                        ├─ Supabase PostgreSQL
                        ├─ Riot Account-v1 / League-v4
                        └─ OP.GG public profile adapter
```

- 프론트: Vite, React, TypeScript, HashRouter. `/HUH/` base path와 직접 새로고침을 안전하게 처리합니다.
- 백엔드: `api/` 아래 Vercel TypeScript Functions. 브라우저에서 외부 API나 DB를 직접 호출하지 않습니다.
- DB: `supabase/migrations/001_initial_schema.sql`. 플레이어, 이벤트, 이벤트 참가자, 경기, 경기 참가자를 저장합니다.
- 인증: Supabase Auth 이메일/비밀번호 로그인 세션을 사용하며, Vercel Functions가 Bearer 토큰을 매 요청 검증합니다.

GitHub Pages의 UI 파일과 `/api/health`는 공개되어도 플레이어·경기 데이터는 로그인 뒤에 있습니다. Supabase Dashboard에서 만든 운영자 계정만 사용하고 공개 회원가입은 비활성화하십시오. 기존 `HUH_ADMIN_TOKEN`은 전환용 fallback일 뿐이며 Auth 배포 확인 후 제거합니다.

프론트 주소: <https://wnstj999.github.io/HUH/>

## 구현된 기능

- 플레이어 추가·수정·비활성화, 검색, 티어·포지션 필터, 오늘 참가 토글
- Riot ID 마지막 `#` 기준 파싱과 공백 보존, Riot ID·PUUID DB 중복 방지
- 내전 티어 `TR(15)`부터 `FF(4)`까지 점수 자동 계산
- Riot ID → PUUID → KR 솔로랭크 실제 조회와 승률 저장
- OP.GG 공개 프로필 서버 조회, Solo/Flex 분리, 시즌별 구조화 레코드 기반 최고 기록 저장
- 참가자 10명 선택, 가능한 포지션 검증, 전 조합의 팀 점수 차이 최소화
- 이벤트·경기·포지션 배정 원자적 저장, 승리팀·상태·세부 전적 입력
- 저장된 경기 기반 개인 승패, 승률, KDA, CS, 딜량, 포지션, 챔피언 통계
- 한국어 기본 및 English 전환, 선택 언어 유지
- 한국어·영어 개인정보 처리방침과 이용약관
- Tournament API adapter와 DB 필드. 권한 전에는 운영 UI에 `권한 대기`만 표시

## 로컬 실행

Node.js 22를 권장합니다.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

macOS/Linux에서는 두 번째 명령을 `cp .env.example .env.local`로 바꾸면 됩니다. 프론트 개발 서버는 기본적으로 `http://localhost:5173/HUH/`입니다.

Vercel Functions까지 로컬에서 실행하려면 `.env.local`의 `VITE_API_BASE_URL=http://localhost:3000`을 유지하고 두 터미널에서 각각 실행합니다. 첫 `vercel dev` 실행은 Vercel 로그인과 프로젝트 연결을 요청할 수 있습니다.

```powershell
npx vercel dev --listen 3000
npm run dev
```

## Supabase 설정

1. 무료 Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/migrations/001_initial_schema.sql`, `002_player_season_rank_history.sql`, `003_auth_and_encrypted_settings.sql` 순서로 실행합니다.
3. Data API → Settings에서 운영 테이블과 `create_inhouse_event`, `create_inhouse_match` 함수를 노출합니다. `app_settings`는 RLS 정책 없이 service role만 접근하도록 유지합니다.
4. Vercel 프로젝트 환경변수에 아래 값을 추가합니다.

```text
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=<sb_secret_...>
# 기존 프로젝트에서 새 Secret Key를 아직 발급하지 않은 경우에만 사용
SUPABASE_SERVICE_ROLE_KEY=<legacy-service-role-key>
```

모든 테이블은 RLS가 활성화되어 있고 브라우저용 공개 정책은 만들지 않습니다. DB 함수도 `service_role`만 실행할 수 있습니다. Supabase Secret Key는 Vercel 서버에서만 사용하며 `VITE_` 접두사를 붙이면 안 됩니다. 기존 JWT 방식의 Service Role Key도 전환 기간 동안 fallback으로 지원합니다.

## Vercel 백엔드 배포

Vercel에서 이 GitHub 저장소를 Import한 뒤 Framework Preset을 `Vite`로 두고 다음 환경변수를 설정합니다.

```text
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
# 또는 기존 프로젝트의 SUPABASE_SERVICE_ROLE_KEY
RIOT_API_KEY=                  # Production Key가 생긴 뒤 선택
SETTINGS_ENCRYPTION_KEY=<32자 이상의 임의 문자열>
OPGG_SCRAPING_ENABLED=true
TOURNAMENT_API_ENABLED=false
# 전환 완료 뒤 삭제
HUH_ADMIN_TOKEN=
ALLOWED_ORIGINS=https://wnstj999.github.io,http://localhost:5173,http://localhost:4173
```

배포 후 `https://<vercel-domain>/api/health`가 민감한 값 없이 Backend, Database, Riot 설정, OP.GG, Tournament 상태를 반환합니다.

이 저장소의 `wnstj999.github.io`, `/HUH/` 값은 현재 HUH 배포용입니다. fork하거나 저장소 이름을 바꾸면 `vite.config.ts`의 base, GitHub Pages URL, `ALLOWED_ORIGINS`를 함께 바꾸십시오.

## GitHub Pages 배포

`.github/workflows/deploy-pages.yml`이 `main` push에서 테스트와 빌드를 거친 뒤 `dist/`를 Pages에 배포합니다.

1. GitHub 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정합니다.
2. Settings → Secrets and variables → Actions → Variables에 아래 값을 추가합니다. Anon key(Publishable key)는 브라우저 공개용 키이며 Secret/Service Role key를 넣으면 안 됩니다.

```text
VITE_API_BASE_URL=https://<vercel-domain>
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

3. `main`에 push하거나 Actions에서 `Deploy GitHub Pages`를 실행합니다.

Vite base는 `/HUH/`이며 앱 라우팅은 HashRouter를 사용하므로 `/HUH/#/players` 같은 경로를 새로고침해도 GitHub Pages 404가 발생하지 않습니다. 기존 `riot.txt`는 빌드 결과 루트로 복사됩니다.

## 최초 배포 순서와 확인

1. Supabase 프로젝트를 만들고 migration SQL 3개를 순서대로 실행합니다.
2. Supabase Authentication → Users에서 운영자 이메일/비밀번호 계정을 만들고 공개 회원가입을 끕니다.
3. Vercel에 서버 환경변수를 넣고 배포합니다.
4. 브라우저에서 `https://<vercel-domain>/api/health`를 열어 `backend=true`, `database=true`를 확인합니다.
5. GitHub Actions 변수 3개를 설정하고 Pages workflow를 실행합니다.
6. Pages에서 운영자 계정으로 로그인한 뒤 Settings에서 Riot Personal API Key를 한 번 중앙 저장합니다.
7. 다른 브라우저에서 같은 계정으로 로그인해 플레이어 목록과 Riot 연결 상태가 같은지 확인합니다.

로그인 계정과 Riot API Key는 중앙 관리되므로 브라우저마다 운영 키를 다시 입력하지 않습니다.

## 로그인과 Riot API Key

Supabase Auth 로그인 세션은 브라우저에 안전하게 유지되고 백엔드는 토큰으로 사용자를 검증합니다. Settings에서 입력한 Riot Personal API Key는 서버에서 먼저 Riot 연결 검사를 통과한 뒤 AES-256-GCM으로 암호화되어 `app_settings` 테이블에 저장됩니다. 암호화 원문과 복호화된 키는 API 응답에 포함되지 않습니다. 암호화 마스터 키인 `SETTINGS_ENCRYPTION_KEY`는 Vercel에만 둡니다.

```text
Riot ID (GameName#TagLine)
  → POST /api/riot/account
  → asia.api.riotgames.com account-v1
  → PUUID
  → POST /api/riot/rank 또는 /api/riot/player-refresh
  → kr.api.riotgames.com league-v4
  → RANKED_SOLO_5x5 저장
```

DB에 저장된 암호화 Riot 키가 있으면 그 키를 사용하고, 아직 저장하지 않은 경우에만 Vercel의 `RIOT_API_KEY`를 fallback으로 사용합니다. Development Key는 Riot 정책상 주기적으로 만료되므로 만료 시 어느 컴퓨터에서든 Settings에서 새 키로 한 번 교체하면 됩니다.

## OP.GG 조회 흐름

`POST /api/opgg/history`와 player refresh가 서버에서 `https://op.gg/lol/summoners/kr/...` 공개 프로필을 요청합니다. adapter는 HTML 전체에서 티어 문자열을 긁는 방식이 아니라 각 Next.js Flight 구조화 데이터 블록을 해석하고 다음을 한 레코드 단위로 검증합니다.

- `gameType`이 `SOLORANKED` 또는 `FLEXRANKED`인지
- 같은 시즌 레코드의 `season`, `rank_entries`, `tier`, `division`, `lp`인지
- LP가 `null`이면 `0LP`로 만들지 않는지

Solo와 Flex는 별도 결과로 반환하며, OP.GG 실패는 성공한 Riot 현재 랭크 저장을 취소하지 않습니다. 결과는 함수 인스턴스에서 6시간 캐시됩니다. OP.GG 공개 페이지 구조나 접근 정책은 바뀔 수 있으므로 parser 테스트와 실제 조회 점검을 배포 전에 실행하십시오.

## Tournament API

`TOURNAMENT_API_ENABLED=false`가 기본입니다. `server/tournament/adapter.ts`에 Provider, Tournament, Tournament Code 연결 인터페이스가 있고 DB에는 `tournament_code`, `riot_game_id` 및 상세 경기 통계 필드가 준비되어 있습니다. Riot 권한이 승인되기 전에는 실제 코드처럼 보이는 mock tournament code를 만들지 않습니다.

## 검증

```bash
npm run typecheck
npm run lint
npm test
npm run build

# 선택: 실제 OP.GG 공개 프로필 네트워크 검사
OPGG_LIVE_TEST=true npm test
```

## 보안 메모

- `.env`, `.env.*`, Vercel 로컬 설정, 로그와 빌드 결과는 Git에서 제외됩니다.
- Riot API Key는 AES-256-GCM 암호문으로만 DB에 저장하고 `SETTINGS_ENCRYPTION_KEY`는 Vercel 환경변수에만 둡니다.
- Supabase 공개 회원가입을 끄고 Dashboard에서 만든 운영자 계정만 사용합니다.
- CORS는 GitHub Pages origin과 명시한 localhost만 허용합니다. 브라우저 Origin에는 URL path가 포함되지 않으므로 `/HUH/`만 CORS 수준에서 구분할 수는 없습니다.
- Auth 전환 확인 후 임시 `HUH_ADMIN_TOKEN`을 제거해 로그인만 허용합니다.

이 프로젝트는 Riot Games의 공식 서비스 또는 승인된 프로젝트가 아니며 Riot Games의 공식 의견을 나타내지 않습니다.
