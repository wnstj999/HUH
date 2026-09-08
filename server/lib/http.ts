import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { createClient, type User } from '@supabase/supabase-js';
import { RiotIdParseError } from '../../src/lib/riotId.js';

export interface VercelRequest {
  method?: string;
  headers: IncomingHttpHeaders;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
  authUser?: User;
}

export interface VercelResponse {
  setHeader(name: string, value: string): VercelResponse;
  status(code: number): VercelResponse;
  json(body: unknown): void;
  end(): void;
}

const DEFAULT_ORIGINS = ['https://wnstj999.github.io', 'http://localhost:5173', 'http://localhost:4173'];

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}

function authAdminClient() {
  const url = process.env.SUPABASE_URL_2 || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_BACKEND_KEY_2 || process.env.SUPABASE_BACKEND_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new HttpError(503, 'DATABASE_NOT_CONFIGURED', 'Database 환경변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const allowed = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-HUH-Access-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  if (origin && !allowed.includes(origin)) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', '허용되지 않은 요청 Origin입니다.');
  return false;
}

export function requireMethod(req: VercelRequest, methods: string[]): void {
  if (!req.method || !methods.includes(req.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청 방식입니다.');
}

export async function requireAccess(req: VercelRequest): Promise<User | null> {
  // Test deployments can be opened without an operator login. Keep this behind
  // an explicit server-side flag so normal deployments remain protected.
  if (process.env.HUH_DISABLE_AUTH === 'true') return null;

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    const { data, error } = await authAdminClient().auth.getUser(token);
    if (!error && data.user) return data.user;
    throw new HttpError(401, 'AUTH_INVALID', '로그인 세션이 만료되었거나 올바르지 않습니다.');
  }

  // Temporary rollout compatibility. Remove HUH_ADMIN_TOKEN after Auth is live.
  const expected = process.env.HUH_ADMIN_TOKEN;
  const actual = req.headers['x-huh-access-token'];
  if (expected && typeof actual === 'string' && safeEqual(actual, expected)) return null;
  throw new HttpError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function bodyAsObject(req: VercelRequest): Record<string, unknown> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw new HttpError(400, 'INVALID_BODY', 'JSON 요청 본문이 필요합니다.');
  return req.body as Record<string, unknown>;
}

export function sendError(res: VercelResponse, error: unknown): void {
  if (error instanceof HttpError) { res.status(error.status).json({ error: { code: error.code, message: error.message } }); return; }
  if (error instanceof RiotIdParseError) { res.status(400).json({ error: { code: 'INVALID_RIOT_ID', message: error.message } }); return; }
  const message = error instanceof Error && error.message ? error.message : '서버 요청을 처리하지 못했습니다.';
  const secrets = [process.env.RIOT_API_KEY, process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.HUH_ADMIN_TOKEN, process.env.SETTINGS_ENCRYPTION_KEY].filter((value): value is string => Boolean(value));
  const safeMessage = secrets.reduce((current, secret) => current.replaceAll(secret, '[REDACTED]'), message).replace(/RGAPI-[A-Za-z0-9_-]+/g, '[REDACTED]');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: safeMessage } });
}

export function handler(action: (req: VercelRequest, res: VercelResponse) => Promise<void>, options: { public?: boolean } = {}) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      if (applyCors(req, res)) return;
      if (!options.public) req.authUser = (await requireAccess(req)) ?? undefined;
      await action(req, res);
    } catch (error) { sendError(res, error); }
  };
}
