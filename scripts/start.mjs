import process from 'node:process';
import { spawn } from 'node:child_process';
import { loadEnv } from 'vite';

const settings = { ...loadEnv('development', process.cwd(), 'VITE_'), ...process.env };
const publicSite = 'https://wnstj999.github.io/HUH/';
async function getText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`공개 사이트 설정을 읽지 못했습니다 (${response.status}).`);
  return response.text();
}
try {
  if (!settings.VITE_SUPABASE_URL || !settings.VITE_SUPABASE_ANON_KEY) {
    const html = await getText(publicSite);
    const script = html.match(/<script[^>]+src="([^"]+\.js)"/);
    if (!script?.[1]) throw new Error('공개 사이트의 설정 파일을 찾지 못했습니다.');
    const assetUrl = new URL(script[1], publicSite);
    if (assetUrl.origin !== new URL(publicSite).origin) throw new Error('예상하지 않은 설정 파일 주소입니다.');
    const bundle = await getText(assetUrl.href);
    const supabaseUrl = bundle.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
    const ref = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : null;
    const tokens = bundle.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) ?? [];
    const publishableKeys = [...new Set(bundle.match(/sb_publishable_[A-Za-z0-9_-]+/g) ?? [])];
    const publicKey = tokens.find(token => {
      try { const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()); return payload.role === 'anon' && payload.ref === ref; }
      catch { return false; }
    }) ?? (publishableKeys.length === 1 ? publishableKeys[0] : undefined);
    if (!supabaseUrl || !publicKey) throw new Error('공개 로그인 설정을 자동으로 확인하지 못했습니다. 운영 사이트 연결이 준비되어야 합니다.');
    if (settings.VITE_SUPABASE_URL && settings.VITE_SUPABASE_URL !== supabaseUrl) throw new Error('프로젝트 주소가 다른 설정을 자동으로 섞을 수 없습니다.');
    settings.VITE_SUPABASE_URL = supabaseUrl;
    settings.VITE_SUPABASE_ANON_KEY = publicKey;
    settings.VITE_API_BASE_URL ||= 'https://huh-api.vercel.app';
  }
  settings.VITE_API_BASE_URL ||= 'https://huh-api.vercel.app';
  console.log('기존 사이트의 로그인과 중앙 DB를 사용합니다. DB 설정 파일이나 SQL 입력은 필요하지 않습니다.');
  const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--configLoader', 'runner', '--host', 'localhost', '--port', '5173', '--strictPort', '--open'], { env: settings, stdio: 'inherit' });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) { console.error(error instanceof Error ? error.message : '실행 연결을 확인하지 못했습니다.'); process.exitCode = 1; }
