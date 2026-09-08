import { createClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_BACKEND_KEY_2 || process.env.SUPABASE_BACKEND_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(503, 'DATABASE_NOT_CONFIGURED', 'Database 환경변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function assertDb<T>(result: { data: T; error: { message: string; code?: string } | null }): NonNullable<T> {
  if (result.error) {
    if (result.error.code === '23505') throw new HttpError(409, 'DUPLICATE', '같은 Riot ID 또는 PUUID가 이미 등록되어 있습니다.');
    throw new HttpError(500, 'DATABASE_ERROR', 'Database 요청을 처리하지 못했습니다.');
  }
  if (result.data == null) throw new HttpError(404, 'NOT_FOUND', '데이터를 찾을 수 없습니다.');
  return result.data as NonNullable<T>;
}
