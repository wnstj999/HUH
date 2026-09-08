const RIOT_KEY = 'huh.riotApiKey';
const ACCESS_KEY = 'huh.accessToken';

export function getLegacyRiotKey(): string {
  return sessionStorage.getItem(RIOT_KEY) ?? localStorage.getItem(RIOT_KEY) ?? '';
}

export function clearLegacyAccessKey(): void {
  sessionStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(ACCESS_KEY);
}

export function clearLegacyBrowserKeys(): void {
  sessionStorage.removeItem(RIOT_KEY);
  sessionStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(RIOT_KEY);
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem('huh.rememberKeys');
}
