import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';
import { HttpError } from './http.js';

const RIOT_KEY_SETTING = 'riot_api_key';

function encryptionKey(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new HttpError(503, 'SETTINGS_ENCRYPTION_NOT_CONFIGURED', '중앙 API 키 암호화 환경변수가 설정되지 않았습니다.');
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join(':');
}

function decrypt(payload: string): string {
  const [version, ivValue, tagValue, encryptedValue] = payload.split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('Invalid encrypted setting');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

export async function getStoredRiotKey(): Promise<string | null> {
  const result = await db().from('app_settings').select('encrypted_value').eq('key', RIOT_KEY_SETTING).maybeSingle();
  if (result.error) {
    if (result.error.code === 'PGRST205' || result.error.code === '42P01') return null;
    throw new HttpError(500, 'DATABASE_ERROR', '중앙 Riot API Key를 읽지 못했습니다.');
  }
  if (!result.data?.encrypted_value) return null;
  try { return decrypt(String(result.data.encrypted_value)); }
  catch { throw new HttpError(500, 'SETTINGS_DECRYPT_FAILED', '저장된 Riot API Key를 복호화하지 못했습니다.'); }
}

export async function resolveRiotKey(): Promise<string> {
  const stored = await getStoredRiotKey();
  const key = stored || process.env.RIOT_API_KEY;
  if (!key) throw new HttpError(400, 'RIOT_KEY_MISSING', 'Riot API Key가 설정되지 않았습니다.');
  return key;
}

export async function getRiotKeyStatus(): Promise<{ configured: boolean; source: 'database' | 'environment' | 'none'; updatedAt: string | null }> {
  const result = await db().from('app_settings').select('updated_at').eq('key', RIOT_KEY_SETTING).maybeSingle();
  if (!result.error && result.data) {
    encryptionKey();
    return { configured: true, source: 'database', updatedAt: String(result.data.updated_at) };
  }
  if (process.env.RIOT_API_KEY) return { configured: true, source: 'environment', updatedAt: null };
  return { configured: false, source: 'none', updatedAt: null };
}

export async function saveRiotKey(value: string, userId: string | null): Promise<string> {
  const key = value.trim();
  if (!/^RGAPI-[A-Za-z0-9_-]+$/.test(key)) throw new HttpError(400, 'RIOT_KEY_INVALID', '올바른 Riot API Key를 입력하세요.');
  const updatedAt = new Date().toISOString();
  const result = await db().from('app_settings').upsert({
    key: RIOT_KEY_SETTING,
    encrypted_value: encrypt(key),
    updated_at: updatedAt,
    updated_by: userId,
  }, { onConflict: 'key' });
  if (result.error) throw new HttpError(500, 'DATABASE_ERROR', '중앙 Riot API Key를 저장하지 못했습니다.');
  return updatedAt;
}
