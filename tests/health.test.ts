import { describe, expect, it } from 'vitest';
import healthHandler from '../api/health';
import type { VercelRequest, VercelResponse } from '../server/lib/http';

class ResponseMock implements VercelResponse {
  code = 0;
  body: unknown;
  headers = new Map<string, string>();
  setHeader(name: string, value: string) { this.headers.set(name, value); return this; }
  status(code: number) { this.code = code; return this; }
  json(body: unknown) { this.body = body; }
  end() { /* no response body */ }
}

describe('GET /api/health', () => {
  it('reports a reachable but degraded backend without leaking configuration', async () => {
    const request: VercelRequest = { method: 'GET', headers: {}, query: {} };
    const response = new ResponseMock();
    await healthHandler(request, response);
    expect(response.code).toBe(200);
    expect(response.body).toMatchObject({ backend: true, database: false, status: 'degraded' });
    expect(JSON.stringify(response.body)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
