# HUH — League of Legends 내전 관리

참가자 관리, 5:5 팀 편성, 수동 경기 결과·개인 통계, 커스텀 팀 및 대진표를 제공하는 React + TypeScript 사이트입니다.

## 가장 쉬운 실행: DB·로그인·API 키 없이

1. [Node.js 22 LTS](https://nodejs.org/)를 설치합니다. 이미 설치했다면 건너뜁니다.
2. GitHub에서 **Code → Download ZIP**으로 내려받고 압축을 풉니다.
3. Windows에서 `package.json`과 `start-local.cmd`가 있는 폴더를 열고 **start-local.cmd**를 더블클릭합니다. 첫 실행은 인터넷으로 필요한 프로그램을 설치합니다. 사용하는 동안 실행 창을 열어 두세요. 종료는 5번을 따릅니다.
4. 브라우저가 열리면 **설정 → 예시 선수 10명 추가**를 누릅니다. **내전 생성**에서 팀을 편성하고 경기를 저장한 뒤, **경기 기록**에서 승리팀과 개인 기록을 입력합니다. **통계**에서 저장된 결과를 확인합니다.
5. 종료하려면 실행 창에서 Ctrl+C를 누릅니다. 다시 start-local.cmd를 열면 같은 브라우저에 저장한 기록을 사용할 수 있습니다.

자동으로 브라우저가 열리지 않으면 실행 창에 표시된 Local 주소를 엽니다. 기본 주소는 `http://127.0.0.1:5173/HUH/`이며, 포트가 사용 중이면 달라질 수 있습니다.

터미널을 사용할 수 있다면 Windows/macOS/Linux 모두 다음으로 실행합니다.

```text
npm ci
npm start
```

**.env 파일을 복사하거나 DB, Vercel, Supabase를 설정할 필요가 없습니다.** `npm start`는 환경변수 유무와 무관하게 로컬 시연 모드를 사용하며 서버에 데이터를 보내지 않습니다. `npm run dev`는 API 주소가 없을 때 로컬 모드를 사용합니다. 서버 연결 검증에는 아래 서버 모드를 사용하세요.

## 저장 범위와 시연 데이터

- 참가자·내전 경기·개인 기록은 브라우저의 `huh.local.v1`에 저장합니다. 커스텀 팀과 대진표는 기존 로컬 저장 기능을 사용합니다.
- 브라우저·프로필·사이트 주소·포트가 달라지면 저장소도 달라집니다. 브라우저 데이터 삭제나 시크릿 창 종료 시 기록을 잃을 수 있습니다. 여러 컴퓨터 간 공유나 운영용 백업 기능은 없습니다.
- 예시 선수는 가상 데이터이고 실제 Riot 전적은 없습니다. 예시 추가는 비어 있는 참가자·경기 저장소에서만 가능합니다. 실제 참가자는 **플레이어 → 추가**에서 직접 등록하세요.
- 로컬 모드의 전력 점수는 입력한 티어를 기반으로 추정합니다. 실제 최근 경기 분석이 아니며, Riot 조회·키 저장·OP.GG 조회 요청은 설명 메시지와 함께 거절합니다.
- DB와 서버 연결 상태는 연결된 것처럼 표시하지 않습니다. 상단의 **LOCAL DEMO** 안내로 시연 모드를 구분합니다.

## Riot Production Key 재신청용 시연

키 없이도 위의 참가자 등록 → 팀 편성 → 결과 입력 → 통계 흐름을 실제로 실행할 수 있습니다. 이는 수동 내전 관리 프로토타입이며, 자동 전적 수집 완성본으로 제출하지 마세요.

[Riot 공식 FAQ](https://developer.riotgames.com/docs/faqs)는 GitHub 소스 링크만으로 신청을 받지 않으며 작동하는 앱/사이트 또는 사용자 흐름을 보여주는 자료를 요구합니다. 로컬 주소는 심사자가 접속할 수 없습니다. 공개 시연 URL 또는 녹화 자료를 준비하고, 다음 내용을 신청 설명에 구분해서 적으세요.

- 현재 작동: 참가자 관리, 팀 편성, 수동 결과·통계, 대진표. 시연 데이터는 방문자의 브라우저에만 저장됩니다.
- 서버 설정 후 사용: Riot Account-v1 / League-v4 및 Match-v5 일반 경기 조회, 중앙 DB 저장.
- 미구현: 실제 Tournament Provider/Code 생성, 결과 콜백 수신 및 상세 통계 저장. `server/tournament/adapter.ts`는 비활성 인터페이스만 있습니다. **Production Key만 넣거나 플래그만 켜도 내전 자동 수집이 시작되지 않습니다.**

[Portal 문서](https://developer.riotgames.com/docs/portal)에 따르면 Personal Key는 Tournament API를 사용할 수 없습니다. [LoL 정책](https://developer.riotgames.com/docs/lol)에 따른 사용자 설정 경기 기록 공개 동의 등도 실제 수집 도입 전에 충족해야 합니다. 승인은 Riot의 판단이며 이 시연으로 보장되지 않습니다.

### 공개 시연 빌드

```text
npm run build:demo
```

`dist/`에 키나 백엔드 없이 동작하는 정적 사이트를 생성합니다. 현재 base는 `/HUH/`이고 HashRouter를 사용합니다. `riot.txt`도 빌드에 포함됩니다.

기존 GitHub Pages workflow는 **Actions → Deploy GitHub Pages → Run workflow → demo=true**로 시연 모드를 선택할 수 있습니다. 이 모드는 서버 환경변수를 요구하지 않습니다. Pages가 처음이라면 저장소 **Settings → Pages → Source → GitHub Actions**가 필요합니다. 배포는 별도 작업이며 이 변경을 적용하는 것만으로 공개 사이트가 배포되지는 않습니다. 시연 URL은 현재 HUH 설정에서 `https://wnstj999.github.io/HUH/`입니다. 배포 성공 후 실제 페이지를 확인한 다음 신청에 사용하세요.

## 기존 서버 모드: 중앙 저장이 필요할 때만

구조는 그대로 유지합니다.

```text
React / GitHub Pages → Vercel Functions (api/) → Supabase PostgreSQL
                                            → Riot API / OP.GG adapter
```

로컬 시연 모드는 이 서버 경로와 분리됩니다. 운영용 공유 저장에는 아래 설정이 여전히 필요하며, 초보자 로컬 실행을 위해 수행할 필요는 없습니다.

1. Supabase 프로젝트에서 `supabase/migrations/001_initial_schema.sql`부터 `004_match_analysis_and_tournaments.sql`까지 순서대로 적용합니다. 기존 프로젝트는 적용하지 않은 migration만 실행합니다.
2. Supabase Auth에 운영자 계정을 만들고 공개 회원가입을 비활성화합니다. 서버의 Bearer 인증과 RLS를 유지합니다. **현재 프론트에는 로그인 화면이 없으므로 운영 공개 전 로그인 연결 작업이 추가로 필요합니다.** 로컬 시연을 위해 서버 인증을 해제하지 마세요.
3. Vercel에 서버 환경변수를, 프론트 빌드에 공개 환경변수를 넣습니다. [.env.example](.env.example)은 이 서버 모드의 예시입니다.
4. `/api/health`에서 `backend=true`, `database=true`를 확인합니다. 실제 서버 호출·인증·Riot 조회를 별도로 검증한 뒤 운영합니다.

서버 환경변수:

```text
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SECRET_KEY=<server-only secret>
# 기존 프로젝트만 SUPABASE_SERVICE_ROLE_KEY로 대체 가능
SETTINGS_ENCRYPTION_KEY=<32자 이상의 임의 문자열>
RIOT_API_KEY=
OPGG_SCRAPING_ENABLED=false
TOURNAMENT_API_ENABLED=false
ALLOWED_ORIGINS=https://wnstj999.github.io,http://localhost:5173,http://localhost:4173
```

브라우저 공개 환경변수:

```text
VITE_API_BASE_URL=https://<vercel-domain>
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-or-anon-key>
VITE_LOCAL_MODE=false
```

서버 Secret, Service Role Key, Riot 키, 암호화 마스터 키에는 `VITE_` 접두사를 붙이지 마세요. 서버 환경변수는 브라우저에 포함하면 안 됩니다. 서버의 Settings API는 Riot 키 연결 검사 후 AES-256-GCM으로 DB에 저장합니다. `RIOT_API_KEY`는 DB 키가 없을 때 서버 환경변수 fallback입니다.

서버까지 로컬에서 개발할 경우 `.env.local`에 서버/프론트 값을 넣고 `VITE_API_BASE_URL=http://localhost:3000`으로 설정합니다. 두 터미널에서 `npx vercel dev --listen 3000`과 `npm run dev`를 실행합니다. 이 경로는 Vercel 계정 및 Supabase 설정을 요구합니다. 운영 서버의 인증을 유지하고 `HUH_DISABLE_AUTH=true`를 설정하지 마세요.

기존 main push 배포는 서버 모드를 유지합니다. GitHub Actions Variables에 위의 프론트 값 3개가 필요합니다. 수동 시연 배포 후 main push가 서버 모드를 다시 배포할 수 있으니 용도를 확인하세요. 저장소 이름을 바꾸면 Vite base와 배포 URL도 조정해야 합니다.

## 문제 해결

- 실행 창이 바로 닫힘: Node.js를 설치한 뒤 start-local.cmd를 다시 엽니다. 설치 실패 시 인터넷 연결과 창에 표시된 오류를 확인합니다.
- 기록이 안 보임: 이전과 같은 브라우저·프로필·주소·포트인지 확인합니다. 저장소를 지우기 전에 데이터 보존 여부를 확인하세요.
- 저장 실패: 브라우저 저장 차단 또는 공간 부족입니다. 다른 창에서 저장 성공을 가정하지 마세요.
- Riot 버튼 오류: LOCAL DEMO에서는 의도적으로 지원하지 않습니다. 수동 시연은 계속 사용할 수 있습니다.

## 검증

```text
npm run typecheck
npm run lint
npm test
npm run build
npm run build:demo
```

실제 OP.GG 조회 테스트는 `OPGG_LIVE_TEST=true`일 때만 실행합니다. 외부 페이지 구조와 정책은 바뀔 수 있으며 기본 시연은 이를 사용하지 않습니다.

이 프로젝트는 Riot Games의 공식 서비스 또는 승인된 프로젝트가 아니며 Riot Games의 공식 의견을 나타내지 않습니다.
