import { afterEach, describe, expect, it } from 'vitest';
import { RiotIdParseError } from '../src/lib/riotId';
import { handler, sendError, type VercelRequest, type VercelResponse } from '../server/lib/http';

class ResponseMock implements VercelResponse {
  code = 0;
  body: unknown;
  headers = new Map<string, string>();
  setHeader(name: string, value: string) { this.headers.set(name, value); return this; }
  status(code: number) { this.code = code; return this; }
  json(body: unknown) { this.body = body; }
  end() { /* no response body */ }
}

afterEach(() => {
  delete process.env.HUH_ADMIN_TOKEN;
  delete process.env.RIOT_API_KEY;
});

describe('server HTTP boundary', () => {
  it('maps an invalid Riot ID to a client error', () => {
    const response = new ResponseMock();
    sendError(response, new RiotIdParseError());
    expect(response.code).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'INVALID_RIOT_ID' } });
  });

  it('requires the configured operations access key', async () => {
    process.env.HUH_ADMIN_TOKEN = 'test-only-access-key';
    const endpoint = handler(async (_request, response) => { response.status(200).json({ ok: true }); });
    const request: VercelRequest = { method: 'GET', headers: {}, query: {} };
    const response = new ResponseMock();
    await endpoint(request, response);
    expect(response.code).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'ACCESS_DENIED' } });
  });

  it('redacts configured secrets from unexpected errors', () => {
    process.env.RIOT_API_KEY = 'unit-test-secret-value';
    const response = new ResponseMock();
    sendError(response, new Error(`upstream included ${process.env.RIOT_API_KEY}`));
    expect(JSON.stringify(response.body)).not.toContain(process.env.RIOT_API_KEY);
    expect(JSON.stringify(response.body)).toContain('[REDACTED]');
  });
});
