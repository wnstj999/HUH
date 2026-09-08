import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { RiotIdParseError } from '../../src/lib/riotId.js';

export interface VercelRequest {
  method?: string;
  headers: IncomingHttpHeaders;
  query: Record<string, string | string[] | undefined>;
  body?: unknown;
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

export function applyCors(req: VercelRequest, res: VercelResponse): boolean {
  const allowed = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-HUH-Access-Token, X-Riot-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  if (origin && !allowed.includes(origin)) throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', '허용되지 않은 요청 Origin입니다.');
  return false;
}

export function requireMethod(req: VercelRequest, methods: string[]): void {
  if (!req.method || !methods.includes(req.method)) throw new HttpError(405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청 방식입니다.');
}

export function requireAccess(req: VercelRequest): void {
  const expected = process.env.HUH_ADMIN_TOKEN;
  if (!expected) return;
  const actual = req.headers['x-huh-access-token'];
  if (typeof actual !== 'string' || !safeEqual(actual, expected)) throw new HttpError(401, 'ACCESS_DENIED', '운영 접근 키가 올바르지 않습니다.');
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
  const secrets = [process.env.RIOT_API_KEY, process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.HUH_ADMIN_TOKEN].filter((value): value is string => Boolean(value));
  const safeMessage = secrets.reduce((current, secret) => current.replaceAll(secret, '[REDACTED]'), message).replace(/RGAPI-[A-Za-z0-9_-]+/g, '[REDACTED]');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: safeMessage } });
}

export function handler(action: (req: VercelRequest, res: VercelResponse) => Promise<void>, options: { public?: boolean } = {}) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      if (applyCors(req, res)) return;
      if (!options.public) requireAccess(req);
      await action(req, res);
    } catch (error) { sendError(res, error); }
  };
}
