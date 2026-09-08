const RIOT_KEY = 'huh.riotApiKey';
const ACCESS_KEY = 'huh.accessToken';
const REMEMBER_KEY = 'huh.rememberKeys';

function activeStorage(): Storage {
  return localStorage.getItem(REMEMBER_KEY) === 'true' ? localStorage : sessionStorage;
}

export function getRiotApiKey(): string { return activeStorage().getItem(RIOT_KEY) ?? ''; }
export function getAccessToken(): string { return activeStorage().getItem(ACCESS_KEY) ?? ''; }
export function getRememberKeys(): boolean { return localStorage.getItem(REMEMBER_KEY) === 'true'; }

export function saveBrowserKeys(riotApiKey: string, accessToken: string, remember: boolean): void {
  sessionStorage.removeItem(RIOT_KEY);
  sessionStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(RIOT_KEY);
  localStorage.removeItem(ACCESS_KEY);
  localStorage.setItem(REMEMBER_KEY, String(remember));
  const target = remember ? localStorage : sessionStorage;
  if (riotApiKey) target.setItem(RIOT_KEY, riotApiKey.trim());
  if (accessToken) target.setItem(ACCESS_KEY, accessToken.trim());
}

export function maskKey(value: string): string {
  if (!value) return '';
  return `${value.slice(0, Math.min(6, value.length))}${'*'.repeat(Math.max(8, value.length - 6))}`;
}
