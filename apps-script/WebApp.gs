const APP = Object.freeze({
  sheets: {
    players: 'Players',
    events: 'Events',
    participants: 'EventParticipants',
    matches: 'Matches',
    settings: 'Settings',
    logs: 'ApiLogs'
  },
  tiers: ['TR', 'GR', 'LR', 'UR', 'SR', 'S', 'A', 'B', 'C', 'D', 'F', 'FF'],
  tierScores: { TR: 15, GR: 14, LR: 13, UR: 12, SR: 11, S: 10, A: 9, B: 8, C: 7, D: 6, F: 5, FF: 4 },
  positions: ['TOP', 'JUG', 'MID', 'ADC', 'SUP', 'ALL'],
  playerHeaders: ['id','name','customTier','tierScore','riotId','positions','currentRank','historicalSolo','historicalFlex','active','createdAt','updatedAt'],
  eventHeaders: ['id','name','eventDate','status','notes','createdAt','updatedAt'],
  participantHeaders: ['eventId','playerId','status','team','position','updatedAt'],
  matchHeaders: ['id','eventId','matchNo','bluePlayerIds','redPlayerIds','winner','status','tournamentCode','gameId','recordedAt','notes'],
  settingHeaders: ['key','value','description'],
  logHeaders: ['timestamp','level','action','message','details']
});

// The original community spreadsheet is read-only for the web app.
const APP_SHEET_STORAGE_ENABLED = false;

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('HUH 내전 관리')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!payload.shortCode || !payload.gameId) throw new Error('Invalid tournament callback');
    const match = findMatchByCode_(payload.shortCode);
    if (match) updateMatch({ id: match.id, gameId: String(payload.gameId), status: '완료' });
    log_('INFO', 'TOURNAMENT_CALLBACK', '콜백 수신', payload);
    return ContentService.createTextOutput('OK');
  } catch (err) {
    log_('ERROR', 'TOURNAMENT_CALLBACK', err.message, {});
    return ContentService.createTextOutput('ERROR');
  }
}

function setupWebApp() {
  if (!APP_SHEET_STORAGE_ENABLED) return { ok: false, disabled: true };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ensureSheet_(APP.sheets.players, APP.playerHeaders);
    ensureSheet_(APP.sheets.events, APP.eventHeaders);
    ensureSheet_(APP.sheets.participants, APP.participantHeaders);
    ensureSheet_(APP.sheets.matches, APP.matchHeaders);
    ensureSheet_(APP.sheets.settings, APP.settingHeaders);
    ensureSheet_(APP.sheets.logs, APP.logHeaders);
    seedSettings_();
    migrateLegacyPlayers_();
    formatAppSheets_();
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function getAppData() {
  if (!APP_SHEET_STORAGE_ENABLED) {
    return {
      players: [], events: [], participants: [], matches: [],
      tiers: APP.tiers.map(t => ({ name: t, score: APP.tierScores[t] })),
      positions: APP.positions,
      config: { apiConfigured: Boolean(PropertiesService.getScriptProperties().getProperty('RIOT_API_KEY')), tournamentConfigured: false, ownerOnly: true, storageDisabled: true }
    };
  }
  setupWebApp();
  return {
    players: readObjects_(APP.sheets.players).filter(p => String(p.active).toUpperCase() !== 'FALSE'),
    events: readObjects_(APP.sheets.events).sort((a,b) => String(b.eventDate).localeCompare(String(a.eventDate))),
    participants: readObjects_(APP.sheets.participants),
    matches: readObjects_(APP.sheets.matches).sort((a,b) => Number(b.matchNo || 0) - Number(a.matchNo || 0)),
    tiers: APP.tiers.map(t => ({ name: t, score: APP.tierScores[t] })),
    positions: APP.positions,
    config: {
      apiConfigured: Boolean(PropertiesService.getScriptProperties().getProperty('RIOT_API_KEY')),
      tournamentConfigured: Boolean(PropertiesService.getScriptProperties().getProperty('RIOT_TOURNAMENT_ID')),
      ownerOnly: true
    }
  };
}

function rollbackSheetChanges() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Players','Events','EventParticipants','Matches','Settings','ApiLogs'].forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (sheet) ss.deleteSheet(sheet);
  });
  return { ok: true, remainingSheets: ss.getSheets().map(s => s.getName()) };
}

function savePlayer(input) {
  setupWebApp();
  input = input || {};
  const name = clean_(input.name);
  const tier = String(input.customTier || '').toUpperCase();
  const riotId = clean_(input.riotId);
  if (!name) throw new Error('이름을 입력하세요.');
  if (!APP.tiers.includes(tier)) throw new Error('올바른 내전 티어를 선택하세요.');
  if (riotId && !riotId.includes('#')) throw new Error('Riot ID는 이름#태그 형식이어야 합니다.');
  const players = readObjects_(APP.sheets.players);
  const duplicate = players.find(p => p.id !== input.id && riotId && normalizeRiotId_(p.riotId) === normalizeRiotId_(riotId));
  if (duplicate) throw new Error('이미 등록된 Riot ID입니다: ' + duplicate.name);
  const now = new Date().toISOString();
  const record = {
    id: input.id || Utilities.getUuid(),
    name,
    customTier: tier,
    tierScore: APP.tierScores[tier],
    riotId,
    positions: normalizePositions_(input.positions).join(','),
    currentRank: clean_(input.currentRank),
    historicalSolo: clean_(input.historicalSolo),
    historicalFlex: clean_(input.historicalFlex),
    active: input.active === false ? false : true,
    createdAt: input.createdAt || now,
    updatedAt: now
  };
  upsertObject_(APP.sheets.players, 'id', record);
  return record;
}

function deactivatePlayer(id) {
  const player = readObjects_(APP.sheets.players).find(p => p.id === id);
  if (!player) throw new Error('선수를 찾을 수 없습니다.');
  player.active = false;
  player.updatedAt = new Date().toISOString();
  upsertObject_(APP.sheets.players, 'id', player);
  return { ok: true };
}

function refreshPlayerRank(id) {
  const player = readObjects_(APP.sheets.players).find(p => p.id === id);
  if (!player) throw new Error('선수를 찾을 수 없습니다.');
  if (!player.riotId || !String(player.riotId).includes('#')) throw new Error('Riot ID를 먼저 입력하세요.');
  const key = getRiotKey_();
  const parts = String(player.riotId).split('#');
  const account = riotJson_('https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts.slice(1).join('#')), key);
  const entries = riotJson_('https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/' + encodeURIComponent(account.puuid), key);
  const solo = (entries || []).find(x => x.queueType === 'RANKED_SOLO_5x5');
  player.currentRank = solo ? formatOfficialRank_(solo) : 'UNRANKED';
  try {
    const historical = fetchHistoricalRanks_(parts[0], parts.slice(1).join('#'));
    if (historical.solo) player.historicalSolo = historical.solo;
    if (historical.flex) player.historicalFlex = historical.flex;
  } catch (historyError) {
    log_('WARN', 'HISTORY_REFRESH', player.name + ': 기존 과거 티어 보존', { message: historyError.message });
  }
  player.updatedAt = new Date().toISOString();
  upsertObject_(APP.sheets.players, 'id', player);
  log_('INFO', 'RANK_REFRESH', player.name, { riotId: player.riotId });
  return player;
}

function fetchHistoricalRanks_(gameName, tagLine) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'history:' + Utilities.base64EncodeWebSafe((gameName + '#' + tagLine).toLowerCase()).slice(0, 180);
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const url = 'https://op.gg/lol/summoners/kr/' + encodeURIComponent(gameName) + '-' + encodeURIComponent(tagLine);
  const histories = parseOpggRankTables(fetchOpgg(url));
  const soloBest = histories.solo.length ? getHighestTier(histories.solo) : null;
  const flexBest = histories.flex.length ? getHighestTier(histories.flex) : null;
  const result = {
    solo: soloBest ? soloBest.display + ' (' + soloBest.season + ')' : '',
    flex: flexBest ? flexBest.display + ' (' + flexBest.season + ')' : ''
  };
  cache.put(cacheKey, JSON.stringify(result), 21600);
  return result;
}

function refreshAllRanks() {
  const players = readObjects_(APP.sheets.players).filter(p => String(p.active).toUpperCase() !== 'FALSE' && p.riotId);
  const result = { success: 0, failed: 0, errors: [] };
  players.forEach((p, i) => {
    try { refreshPlayerRank(p.id); result.success++; }
    catch (err) { result.failed++; result.errors.push(p.name + ': ' + err.message); }
    if (i < players.length - 1) Utilities.sleep(1100);
  });
  return result;
}

function createEvent(input) {
  setupWebApp();
  input = input || {};
  if (!clean_(input.name)) throw new Error('내전 이름을 입력하세요.');
  const now = new Date().toISOString();
  const record = {
    id: input.id || Utilities.getUuid(),
    name: clean_(input.name),
    eventDate: input.eventDate || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    status: input.status || '준비중',
    notes: clean_(input.notes),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
  upsertObject_(APP.sheets.events, 'id', record);
  if (Array.isArray(input.playerIds)) saveEventParticipants(record.id, input.playerIds);
  return record;
}

function saveEventParticipants(eventId, playerIds) {
  if (!eventId) throw new Error('내전 ID가 없습니다.');
  const sheet = getSheet_(APP.sheets.participants);
  const existing = readObjects_(APP.sheets.participants).filter(x => x.eventId !== eventId);
  const now = new Date().toISOString();
  (playerIds || []).forEach(id => existing.push({ eventId, playerId: id, status: '참가', team: '', position: '', updatedAt: now }));
  rewriteObjects_(sheet, APP.participantHeaders, existing);
  return { ok: true, count: (playerIds || []).length };
}

function generateBalancedTeams(eventId) {
  const players = getEventPlayers_(eventId);
  if (players.length < 2 || players.length % 2 !== 0) throw new Error('참가자는 짝수여야 합니다.');
  const shuffled = players.map(p => ({ p, r: Math.random() })).sort((a,b) => Number(b.p.tierScore) - Number(a.p.tierScore) || a.r - b.r).map(x => x.p);
  const blue = [], red = [];
  let blueScore = 0, redScore = 0;
  shuffled.forEach((p, idx) => {
    const targetBlue = blue.length < players.length / 2 && (red.length >= players.length / 2 || blueScore <= redScore);
    if (targetBlue) { blue.push(p); blueScore += Number(p.tierScore || 0); }
    else { red.push(p); redScore += Number(p.tierScore || 0); }
  });
  return { blue, red, blueScore, redScore, difference: Math.abs(blueScore - redScore) };
}

function createMatch(input) {
  setupWebApp();
  input = input || {};
  if (!input.eventId) throw new Error('내전을 선택하세요.');
  const all = readObjects_(APP.sheets.matches);
  const eventMatches = all.filter(m => m.eventId === input.eventId);
  const now = new Date().toISOString();
  const record = {
    id: Utilities.getUuid(),
    eventId: input.eventId,
    matchNo: eventMatches.reduce((max,m) => Math.max(max, Number(m.matchNo || 0)), 0) + 1,
    bluePlayerIds: (input.bluePlayerIds || []).join(','),
    redPlayerIds: (input.redPlayerIds || []).join(','),
    winner: '',
    status: '대기',
    tournamentCode: '',
    gameId: '',
    recordedAt: now,
    notes: clean_(input.notes)
  };
  appendObject_(APP.sheets.matches, record);
  return record;
}

function updateMatch(input) {
  const match = readObjects_(APP.sheets.matches).find(m => m.id === input.id);
  if (!match) throw new Error('경기를 찾을 수 없습니다.');
  ['winner','status','tournamentCode','gameId','notes'].forEach(k => {
    if (Object.prototype.hasOwnProperty.call(input, k)) match[k] = input[k];
  });
  match.recordedAt = new Date().toISOString();
  upsertObject_(APP.sheets.matches, 'id', match);
  return match;
}

function createTournamentCode(matchId) {
  const match = readObjects_(APP.sheets.matches).find(m => m.id === matchId);
  if (!match) throw new Error('경기를 찾을 수 없습니다.');
  const key = getRiotKey_();
  const props = PropertiesService.getScriptProperties();
  const tournamentId = props.getProperty('RIOT_TOURNAMENT_ID');
  if (!tournamentId) throw new Error('Tournament API 승인 후 RIOT_TOURNAMENT_ID를 설정하세요.');
  const body = {
    mapType: 'SUMMONERS_RIFT',
    pickType: 'TOURNAMENT_DRAFT',
    spectatorType: 'ALL',
    teamSize: 5,
    enoughPlayers: true,
    metadata: JSON.stringify({ matchId: match.id, eventId: match.eventId })
  };
  const response = UrlFetchApp.fetch('https://kr.api.riotgames.com/lol/tournament/v5/codes?count=1&tournamentId=' + encodeURIComponent(tournamentId), {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true,
    headers: { 'X-Riot-Token': key }
  });
  if (response.getResponseCode() >= 300) throw new Error('Tournament Code 생성 실패: ' + response.getResponseCode());
  const codes = JSON.parse(response.getContentText());
  match.tournamentCode = Array.isArray(codes) ? codes[0] : String(codes);
  match.status = '진행중';
  upsertObject_(APP.sheets.matches, 'id', match);
  return match;
}

function setPrivateConfig(input) {
  input = input || {};
  const props = PropertiesService.getScriptProperties();
  if (input.riotApiKey) props.setProperty('RIOT_API_KEY', clean_(input.riotApiKey));
  if (input.tournamentId) props.setProperty('RIOT_TOURNAMENT_ID', clean_(input.tournamentId));
  if (input.adminEmails) props.setProperty('ADMIN_EMAILS', clean_(input.adminEmails));
  return { ok: true, apiConfigured: Boolean(props.getProperty('RIOT_API_KEY')), tournamentConfigured: Boolean(props.getProperty('RIOT_TOURNAMENT_ID')) };
}

function migrateLegacyPlayers_() {
  const target = getSheet_(APP.sheets.players);
  if (target.getLastRow() > 1) return;
  const legacy = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('내전 티어');
  if (!legacy || legacy.getLastRow() < 5) return;
  const values = legacy.getRange(5, 2, legacy.getLastRow() - 4, 8).getDisplayValues();
  const now = new Date().toISOString();
  const seen = {};
  const rows = values.filter(r => clean_(r[0])).map(r => {
    const riotId = clean_(r[2]);
    const key = normalizeRiotId_(riotId) || ('name:' + clean_(r[0]).toLowerCase());
    if (seen[key]) return null;
    seen[key] = true;
    const tier = APP.tiers.includes(String(r[1]).toUpperCase()) ? String(r[1]).toUpperCase() : 'C';
    return {
      id: Utilities.getUuid(), name: clean_(r[0]), customTier: tier, tierScore: APP.tierScores[tier], riotId,
      positions: normalizePositions_(r[4]).join(','), currentRank: clean_(r[5]), historicalSolo: clean_(r[6]), historicalFlex: clean_(r[7]),
      active: true, createdAt: now, updatedAt: now
    };
  }).filter(Boolean);
  rows.forEach(r => appendObject_(APP.sheets.players, r));
  log_('INFO', 'MIGRATION', '기존 내전 티어 선수 이관', { count: rows.length });
}

function getEventPlayers_(eventId) {
  const ids = readObjects_(APP.sheets.participants).filter(x => x.eventId === eventId && x.status !== '불참').map(x => x.playerId);
  return readObjects_(APP.sheets.players).filter(p => ids.includes(p.id));
}

function findMatchByCode_(code) {
  return readObjects_(APP.sheets.matches).find(m => String(m.tournamentCode) === String(code));
}

function getRiotKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('RIOT_API_KEY');
  if (!key) throw new Error('Riot API 키가 설정되지 않았습니다.');
  return key;
}

function riotJson_(url, key) {
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'X-Riot-Token': key } });
  const code = response.getResponseCode();
  if (code === 429) throw new Error('Riot API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.');
  if (code >= 300) throw new Error('Riot API 오류 ' + code);
  return JSON.parse(response.getContentText());
}

function formatOfficialRank_(entry) {
  const short = { IRON:'I', BRONZE:'B', SILVER:'S', GOLD:'G', PLATINUM:'P', EMERALD:'E', DIAMOND:'D', MASTER:'M', GRANDMASTER:'GM', CHALLENGER:'C' };
  const tier = short[entry.tier] || entry.tier;
  return [tier, entry.rank, entry.leaguePoints + 'LP'].filter(Boolean).join(' ');
}

function normalizePositions_(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,/\s]+/);
  const clean = list.map(x => String(x).toUpperCase()).filter(x => APP.positions.includes(x));
  return [...new Set(clean.length ? clean : ['ALL'])];
}

function normalizeRiotId_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s*#\s*/, '#').replace(/\s+/g, ' ');
}

function clean_(value) { return String(value == null ? '' : value).trim(); }

function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(name + ' 시트가 없습니다. setupWebApp을 실행하세요.');
  return sheet;
}

function readObjects_(name) {
  const sheet = getSheet_(name);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift().map(String);
  return values.filter(r => r.some(v => v !== '')).map(r => headers.reduce((o,h,i) => (o[h] = r[i], o), {}));
}

function appendObject_(name, object) {
  const sheet = getSheet_(name);
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => object[h] == null ? '' : object[h]));
}

function upsertObject_(name, key, object) {
  const sheet = getSheet_(name);
  const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  const keyCol = headers.indexOf(key) + 1;
  const values = sheet.getLastRow() > 1 ? sheet.getRange(2,keyCol,sheet.getLastRow()-1,1).getValues().flat() : [];
  const index = values.findIndex(v => String(v) === String(object[key]));
  const row = headers.map(h => object[h] == null ? '' : object[h]);
  if (index < 0) sheet.appendRow(row); else sheet.getRange(index + 2, 1, 1, headers.length).setValues([row]);
}

function rewriteObjects_(sheet, headers, objects) {
  if (sheet.getLastRow() > 1) sheet.getRange(2,1,sheet.getLastRow()-1,Math.max(sheet.getLastColumn(), headers.length)).clearContent();
  if (objects.length) sheet.getRange(2,1,objects.length,headers.length).setValues(objects.map(o => headers.map(h => o[h] == null ? '' : o[h])));
}

function seedSettings_() {
  const sheet = getSheet_(APP.sheets.settings);
  if (sheet.getLastRow() > 1) return;
  const rows = [
    ['APP_NAME','HUH 내전 관리','서비스 이름'],
    ['TIERS',APP.tiers.join(','),'내전 티어 목록'],
    ['TIER_SCORES',JSON.stringify(APP.tierScores),'팀 균형 추천용 기존 티어 점수'],
    ['POSITIONS',APP.positions.join(','),'선택 가능한 포지션'],
    ['MONETIZATION','NONE','수익화 없음'],
    ['CUSTOM_MMR_ELO','NONE','별도 MMR/ELO 없음'],
    ['HISTORICAL_RANK_SOURCE','OP.GG','과거 솔로/자유랭크 최고 티어 조회(6시간 캐시)']
  ];
  sheet.getRange(2,1,rows.length,3).setValues(rows);
}

function formatAppSheets_() {
  Object.values(APP.sheets).forEach(name => {
    const sheet = getSheet_(name);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,sheet.getLastColumn()).setFontWeight('bold').setBackground('#172033').setFontColor('#ffffff');
    sheet.autoResizeColumns(1, Math.min(sheet.getLastColumn(), 12));
  });
}

function log_(level, action, message, details) {
  try { appendObject_(APP.sheets.logs, { timestamp: new Date().toISOString(), level, action, message, details: JSON.stringify(details || {}) }); }
  catch (_) {}
}
