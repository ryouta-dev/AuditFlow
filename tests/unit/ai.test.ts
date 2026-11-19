import { describe, expect, it, vi } from 'vitest';
import { createAiGateway } from '../../src/lib/ai/gateway';
import { createRiverGateway } from '../../src/lib/ai/river';
import {
  directCredentialsSchema,
  directAiRequestSchema,
  riverModel,
  type AiRequest,
} from '../../src/lib/ai/contracts';

const bearer = 'synthetic-session-token-for-tests';
const apiKey = 'synthetic-provider-key-for-tests';
const request: AiRequest = {
  config: { provider: 'openai', model: 'gpt-4.1-mini', apiKey },
  task: 'inspection',
  locale: 'ru',
  prompt: 'Что проверить повторно?',
  context: 'Проход заблокирован.',
};
const make = (
  body: unknown = request,
  token = bearer,
  url = 'https://auditflow.example/api/ai',
) =>
  new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
const chat = (proposal: unknown, finish_reason = 'stop') =>
  Response.json({
    choices: [
      { finish_reason, message: { content: JSON.stringify(proposal) } },
    ],
  });

describe('AI gateway', () => {
  it('routes River from the local demo to its fixed upstream with the River model', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(chat({ text: 'Valid result' }));
    const handle = createRiverGateway(send);
    const origin = 'http://localhost:3000';
    const payload = {
      ...request,
      config: { endpoint: 'https://api.river.ai/v1', model: '', apiKey },
    };
    const makeRiver = (
      input: unknown,
      pageOrigin = origin,
      listen = '127.0.0.1',
    ) =>
      new Request(`http://${listen}:3000/api/ai/river`, {
        method: 'POST',
        headers: {
          Host: 'localhost:3000',
          Origin: pageOrigin,
          'Content-Type': 'application/json',
          'Sec-Fetch-Site': 'same-origin',
        },
        body: JSON.stringify(input),
      });

    expect(
      (await handle(makeRiver(payload, 'https://another.example'))).status,
    ).toBe(403);
    expect((await handle(makeRiver(payload, origin, '0.0.0.0'))).status).toBe(
      403,
    );
    expect(
      (
        await handle(
          makeRiver({
            ...payload,
            config: {
              ...payload.config,
              endpoint: 'https://another.example/v1',
            },
          }),
        )
      ).status,
    ).toBe(400);
    expect(send).not.toHaveBeenCalled();
    const response = await handle(makeRiver(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      task: 'inspection',
      proposal: { text: 'Valid result' },
    });
    const [endpoint, init] = send.mock.calls[0];
    expect(endpoint).toBe('https://api.river.ai/v1/chat/completions');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Bearer ${apiKey}`,
    );
    expect(JSON.parse(String(init?.body)).model).toBe(riverModel);
  });

  it('normalizes endpoint presets and requires HTTPS except on loopback', () => {
    const config = { apiKey, model: '' };
    expect(
      directCredentialsSchema.parse({
        ...config,
        endpoint: 'https://openrouter.ai',
      }),
    ).toMatchObject({
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      model: 'openai/gpt-4.1-mini',
    });
    expect(
      directCredentialsSchema.parse({
        ...config,
        endpoint: 'http://127.0.0.1:11434/v1',
        model: 'llama3.2',
      }),
    ).toMatchObject({
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'llama3.2',
    });
    for (const endpoint of [
      'http://example.com/v1',
      'https://user:pass@example.com/v1',
      'https://example.com/v1?key=abc',
      'file:///tmp/example',
    ]) {
      expect(
        directCredentialsSchema.safeParse({ ...config, endpoint }).success,
      ).toBe(false);
    }
    expect(
      directAiRequestSchema.safeParse({
        ...request,
        task: 'checklist',
        prompt: '',
        context: 'Assignment.',
        config: { ...config, endpoint: 'https://example.com/v1' },
      }).success,
    ).toBe(true);
  });

  it('recognizes a localhost request while Next.js is listening on a wildcard address', async () => {
    const handle = createAiGateway({ authenticate: async () => null });
    const listenUrl = 'http://0.0.0.0:3000/api/ai';
    const local = new Request(listenUrl, {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'http://localhost:3000' },
    });
    const lan = new Request(listenUrl, {
      method: 'POST',
      headers: {
        host: 'auditflow.example:3000',
        origin: 'http://auditflow.example:3000',
      },
    });
    expect((await handle(local)).status).toBe(401);
    expect((await handle(lan)).status).toBe(403);
  });

  it('requires a verified account and secure transport before calling a provider', async () => {
    const send = vi.fn<typeof fetch>();
    const authenticate = vi.fn(async () => null);
    const handle = createAiGateway({ authenticate, send });
    expect((await handle(make(request, ''))).status).toBe(401);
    expect(
      (await handle(make(request, bearer, 'http://auditflow.example/api/ai')))
        .status,
    ).toBe(403);
    expect((await handle(make())).status).toBe(401);
    expect(authenticate).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it('sends each provider key only to its configured endpoint and returns a validated localized proposal', async () => {
    for (const expected of [
      {
        provider: 'openai',
        model: 'gpt-4.1-mini',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        header: `Bearer ${apiKey}`,
      },
      {
        provider: 'gemini',
        model: 'gemini-2.5-flash-lite',
        endpoint:
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',
        header: apiKey,
      },
      {
        provider: 'openrouter',
        model: 'openai/gpt-4.1-mini',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        header: `Bearer ${apiKey}`,
      },
    ] as const) {
      const proposal = { text: 'Қайта тексеріңіз.' };
      const send = vi.fn<typeof fetch>(async () =>
        expected.provider === 'gemini'
          ? Response.json({
              candidates: [
                {
                  finishReason: 'STOP',
                  content: { parts: [{ text: JSON.stringify(proposal) }] },
                },
              ],
            })
          : chat(proposal),
      );
      const authenticate = vi.fn(async () => 'verified-actor');
      const handle = createAiGateway({ authenticate, send });
      const { provider, model } = expected;
      const response = await handle(
        make({ ...request, locale: 'kk', config: { provider, model, apiKey } }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
      expect(await response.json()).toEqual({ task: 'inspection', proposal });
      const [endpoint, init] = send.mock.calls[0];
      expect(endpoint).toBe(expected.endpoint);
      expect(init?.redirect).toBe('error');
      expect(
        new Headers(init?.headers).get(
          provider === 'gemini' ? 'x-goog-api-key' : 'Authorization',
        ),
      ).toBe(expected.header);
      expect(String(init?.body)).toContain('Kazakh');
      expect(String(init?.body)).toContain(request.context);
      expect(String(init?.body)).not.toContain(apiKey);
      expect(authenticate).toHaveBeenCalledWith(
        bearer,
        expect.any(AbortSignal),
      );
    }
  });

  it('rejects unlisted models and keys accidentally included in the reviewed text', async () => {
    const send = vi.fn<typeof fetch>();
    const handle = createAiGateway({
      authenticate: async () => 'verified-actor',
      send,
    });
    expect(
      (
        await handle(
          make({
            ...request,
            config: { ...request.config, model: '../../other' },
          }),
        )
      ).status,
    ).toBe(400);
    expect((await handle(make({ ...request, prompt: apiKey }))).status).toBe(
      400,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('blocks malformed, truncated, and secret-echoing output and suppresses vendor diagnostics', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(chat({ text: 'result', extra: 'unexpected' }))
      .mockResolvedValueOnce(chat({ text: 'result' }, 'length'))
      .mockResolvedValueOnce(chat({ text: apiKey }))
      .mockResolvedValueOnce(
        Response.json({ message: apiKey }, { status: 401 }),
      );
    const handle = createAiGateway({
      authenticate: async () => 'verified-actor',
      send,
    });
    for (const error of [
      'invalid_proposal',
      'response_truncated',
      'invalid_proposal',
    ]) {
      const response = await handle(make());
      expect(response.status).toBe(502);
      expect(await response.json()).toEqual({ error });
    }
    expect(await (await handle(make())).json()).toEqual({
      error: 'provider_auth',
    });
  });

  it('accepts a checklist for a long assignment with only observable criteria and optional references', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(
      chat({
        name: 'Проверка задания',
        sections: [
          {
            title: 'Результат работы',
            questions: [
              {
                title: 'Отчёт содержит выводы',
                source: null,
                type: 'checkbox',
              },
            ],
          },
        ],
      }),
    );
    const handle = createAiGateway({
      authenticate: async () => 'verified-actor',
      send,
    });
    const response = await handle(
      make({
        ...request,
        task: 'checklist',
        prompt: '',
        context: 'Отчёт содержит выводы. '.repeat(350),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      task: 'checklist',
      proposal: {
        sections: [
          {
            questions: [
              { title: 'Отчёт содержит выводы', description: '', source: '' },
            ],
          },
        ],
      },
    });
    const [, init] = send.mock.calls[0];
    expect(JSON.parse(String(init?.body)).max_completion_tokens).toBe(4800);
  });

  it('permits only one provider request per account at a time', async () => {
    let finish: ((response: Response) => void) | undefined;
    let started: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      started = resolve;
    });
    const send = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
          started?.();
        }),
    );
    const handle = createAiGateway({
      authenticate: async () => 'verified-actor',
      send,
    });
    const first = handle(make());
    await gate;
    expect((await handle(make())).status).toBe(429);
    expect(send).toHaveBeenCalledOnce();
    finish?.(chat({ text: 'result' }));
    expect((await first).status).toBe(200);
  });
});
