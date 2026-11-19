import { aiRequestSchema } from './contracts';
import { BodyLimit, readJson } from './json';
import { generate } from './provider';

const maxBodyBytes = 64 * 1024;
const minuteInMs = 60_000;

const error = (code: string, status: number) =>
  Response.json(
    { error: code },
    { status, headers: { 'Cache-Control': 'no-store, private' } },
  );

type Dependencies = {
  authenticate: (bearer: string, signal: AbortSignal) => Promise<string | null>;
  send?: typeof fetch;
};

function usesSecureTransport(request: Request) {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  // Next.js may build the Request URL from its wildcard listen address.
  const host = request.headers.get('host') ?? url.host;
  if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host))
    return false;
  const origin = request.headers.get('origin');
  return !origin || origin === `http://${host.toLowerCase()}`;
}

export function createAiGateway({ authenticate, send = fetch }: Dependencies) {
  const requests = new Map<string, number>();
  const active = new Set<string>();
  let lastMinute = -1;

  return async function handle(request: Request) {
    if (!usesSecureTransport(request)) return error('insecure_origin', 403);
    const bearer = /^Bearer ([A-Za-z0-9._~-]{20,4096})$/i.exec(
      request.headers.get('authorization') ?? '',
    )?.[1];
    if (!bearer) return error('sign_in', 401);
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'application/json'
    )
      return error('invalid_request', 415);

    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(25_000),
    ]);
    let actor: string | null;
    try {
      actor = await authenticate(bearer, signal);
    } catch {
      return error(signal.aborted ? 'timeout' : 'auth_unavailable', 503);
    }
    if (!actor) return error('sign_in', 401);

    let body: unknown;
    try {
      body = await readJson(request, maxBodyBytes, signal);
    } catch (cause) {
      if (signal.aborted) return error('timeout', 504);
      return cause instanceof BodyLimit
        ? error('invalid_request', 413)
        : error('invalid_request', 400);
    }
    const input = aiRequestSchema.safeParse(body);
    if (!input.success) return error('invalid_request', 400);

    const minute = Math.floor(Date.now() / minuteInMs);
    if (minute !== lastMinute) {
      requests.clear();
      lastMinute = minute;
    }
    const count = requests.get(actor) ?? 0;
    if (active.has(actor) || count >= 6) return error('rate_limit', 429);
    requests.set(actor, count + 1);
    active.add(actor);

    try {
      const result = await generate(input.data, send, signal);
      return typeof result === 'string'
        ? error(result, 502)
        : Response.json(result, {
            headers: { 'Cache-Control': 'no-store, private' },
          });
    } catch {
      return signal.aborted
        ? error('timeout', 504)
        : error('provider_unavailable', 502);
    } finally {
      active.delete(actor);
    }
  };
}
