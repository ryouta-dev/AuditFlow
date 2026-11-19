import { directAiRequestSchema, riverEndpoint } from './contracts';
import { BodyLimit, readJson } from './json';
import { generate } from './provider';

const localhost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
const maxBodyBytes = 64 * 1024;

function json(value: object, status: number) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}

export function createRiverGateway(send: typeof fetch = fetch) {
  let active = false;

  return async (request: Request) => {
    // Next builds this URL using its listen address. Require a loopback bind and a same-origin page.
    const url = new URL(request.url);
    const host = request.headers.get('host') ?? '';
    const site = request.headers.get('sec-fetch-site');
    if (
      !localhost.test(url.hostname) ||
      !localhost.test(host) ||
      request.headers.get('origin') !==
        `${url.protocol}//${host.toLowerCase()}` ||
      (site && site !== 'same-origin')
    ) {
      return json({ error: 'local_river_only' }, 403);
    }
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        .trim()
        .toLowerCase() !== 'application/json'
    ) {
      return json({ error: 'invalid_request' }, 415);
    }

    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(55_000),
    ]);
    let body: unknown;
    try {
      body = await readJson(request, maxBodyBytes, signal);
    } catch (failure) {
      if (signal.aborted) return json({ error: 'timeout' }, 504);
      return json(
        { error: 'invalid_request' },
        failure instanceof BodyLimit ? 413 : 400,
      );
    }
    const input = directAiRequestSchema.safeParse(body);
    if (!input.success || input.data.config.endpoint !== riverEndpoint) {
      return json({ error: 'invalid_request' }, 400);
    }
    if (active) return json({ error: 'rate_limit' }, 429);
    active = true;
    try {
      const result = await generate(input.data, send, signal);
      return typeof result === 'string'
        ? json({ error: result }, 502)
        : json(result, 200);
    } catch {
      return signal.aborted
        ? json({ error: 'timeout' }, 504)
        : json({ error: 'provider_unavailable' }, 502);
    } finally {
      active = false;
    }
  };
}
