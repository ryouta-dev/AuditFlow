import { expect, test } from '@playwright/test';
import { Workbook } from 'exceljs';
import { strToU8, zipSync } from 'fflate';

test('uses the local relay and defaults to the River model', async ({
  page,
}) => {
  await page.goto('/settings/ai');
  const providerKey = 'rv_synthetic_test_key';
  await page.route('**/api/ai/river', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      task: 'checklist',
      config: {
        endpoint: 'https://api.river.ai/v1/chat/completions',
        apiKey: providerKey,
        model: 'deepseek-ai/DeepSeek-V4.1-Flash',
      },
    });
    await route.fulfill({
      json: {
        task: 'checklist',
        proposal: {
          name: 'Проверка мастерской',
          description: '',
          sections: [
            {
              title: 'Выходы',
              questions: [
                {
                  title: 'Выход свободен?',
                  description: '',
                  type: 'boolean',
                  required: true,
                  weight: 1,
                  severity: 'high',
                },
              ],
            },
          ],
        },
      },
    });
  });
  await page
    .getByRole('textbox', { name: 'Адрес API' })
    .fill('https://api.river.ai/v1');
  await page.getByLabel('Ключ API', { exact: true }).fill(providerKey);
  await page
    .getByRole('button', { name: 'Использовать ключ в этом сеансе' })
    .click();
  await page
    .getByRole('textbox', { name: 'Текст задания' })
    .fill('Проверить эвакуационный выход.');
  await page.getByRole('checkbox', { name: /Я проверил текст/ }).check();
  await page
    .getByRole('button', { name: 'Отправить провайдеру api.river.ai' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Проверка мастерской' }),
  ).toBeVisible();
});

test('imports an assignment and creates an editable checklist without Supabase', async ({
  page,
  context,
  request,
}) => {
  const apiKey = 'synthetic-browser-api-key';
  const endpoint = 'https://ai-fixture.example.test/v1/chat/completions';
  let sent = 0;
  await page.route(endpoint, async (route) => {
    const command = route.request();
    if (command.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization,content-type',
        },
      });
      return;
    }
    sent++;
    expect(command.headers().authorization).toBe(`Bearer ${apiKey}`);
    expect(command.headers().cookie).toBeUndefined();
    const body = command.postDataJSON();
    expect(body.model).toBe('gpt-4.1-mini');
    expect(JSON.parse(body.messages[1].content)).toEqual({
      request: '',
      reviewedContext: 'Проверить ширину прохода и доступ к огнетушителю.',
    });
    expect(JSON.stringify(body)).not.toContain('assignment.pdf');
    await route.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                name: 'Контроль проходов',
                description: '',
                sections: [
                  {
                    title: 'Эвакуация',
                    questions: [
                      {
                        title: 'Ширина прохода достаточна?',
                        description: '',
                        source: 'Задание пользователя',
                        type: 'boolean',
                        required: true,
                        weight: 1,
                        severity: 'medium',
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      },
    });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Открыть демо' }).click();
  await expect(
    page.getByRole('heading', { name: 'Обзор', exact: true }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await page
    .getByRole('link', { name: 'Создать с помощью ИИ', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Создать чек-лист с ИИ', exact: true }),
  ).toBeVisible();
  const file = page.getByLabel('Загрузить файл задания');
  const text = page.getByRole('textbox', { name: 'Текст задания' });
  await text.fill('Вставленный текст задания');
  await page
    .getByRole('textbox', { name: 'Адрес API' })
    .fill('https://ai-fixture.example.test/v1');
  await page.getByLabel('Ключ API', { exact: true }).fill(apiKey);
  await page
    .getByRole('button', { name: 'Использовать ключ в этом сеансе' })
    .click();
  await expect(text).toHaveValue('Вставленный текст задания');
  await file.setInputFiles({
    name: 'assignment.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Проверка\n- Осмотреть аварийный выход.'),
  });
  await expect(text).toHaveValue('# Проверка\n- Осмотреть аварийный выход.');
  await file.setInputFiles({
    name: 'assignment.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Проверить запасные выходы.'),
  });
  await expect(text).toHaveValue('Проверить запасные выходы.');
  const xml =
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Проверить освещение.</w:t></w:r></w:p></w:body></w:document>';
  const docx = zipSync({ 'word/document.xml': strToU8(xml) });
  await file.setInputFiles({
    name: 'assignment.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from(docx),
  });
  await expect(text).toHaveValue('Проверить освещение.');
  const workbook = new Workbook();
  workbook.addWorksheet('Требования').addRow(['Огнетушитель доступен']);
  workbook
    .addWorksheet('Скрытый лист', { state: 'hidden' })
    .addRow(['Внутренняя заметка']);
  await file.setInputFiles([
    {
      name: 'source.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    },
    {
      name: 'context.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Осмотреть проходы.'),
    },
  ]);
  await expect(text).toHaveValue(
    '[source.xlsx]\n[Требования]\nA: Огнетушитель доступен\n\n[context.txt]\nОсмотреть проходы.',
  );
  const pdfPage = await context.newPage();
  const assignment = await (async () => {
    try {
      await pdfPage.setContent(
        '<meta charset="UTF-8"><p>Проверить доступ к огнетушителю.</p>',
      );
      return await pdfPage.pdf();
    } finally {
      await pdfPage.close();
    }
  })();
  await file.setInputFiles({
    name: 'assignment.pdf',
    mimeType: 'application/pdf',
    buffer: assignment,
  });
  await expect(text).toHaveValue('Проверить доступ к огнетушителю.');
  await expect(
    page.getByRole('textbox', { name: 'Дополнительные указания' }),
  ).toHaveValue('');

  const send = page.getByRole('button', {
    name: 'Отправить провайдеру ai-fixture.example.test',
  });
  await expect(send).toBeDisabled();
  await page.getByRole('checkbox', { name: /Я проверил текст/ }).check();
  await text.fill('Проверить ширину прохода и доступ к огнетушителю.');
  await expect(send).toBeDisabled();
  expect(sent).toBe(0);
  await page.getByRole('checkbox', { name: /Я проверил текст/ }).check();
  await send.click();
  await page
    .getByRole('button', { name: 'Открыть в редакторе чек-листа' })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Название чек-листа' }),
  ).toHaveValue('Контроль проходов');
  await page.getByText('Способ проверки и источник', { exact: true }).click();
  await expect(page.getByLabel('Источник требования')).toHaveValue(
    'Задание пользователя',
  );
  await page
    .getByRole('button', { name: 'Сохранить черновик', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Редактирование чек-листа' }),
  ).toBeVisible();
  expect(sent).toBe(1);
  expect(
    await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    ),
  ).not.toContain(apiKey);
  await page.goto('/settings/ai');
  await expect(page.getByLabel('Ключ API', { exact: true })).toHaveValue('');
  await expect(
    page.getByRole('textbox', { name: 'Текст задания' }),
  ).toHaveCount(0);

  const unauthorized = await request.post('/api/ai', { data: {} });
  expect(unauthorized.status()).toBe(401);
  expect(unauthorized.headers()['cache-control']).toContain('no-store');
});

test.describe('signed-in browser with synthetic Auth and provider fixtures', () => {
  test.use({ serviceWorkers: 'block' });
  test.skip(
    process.env.AUDITFLOW_E2E_AI !== '1',
    'Requires the dedicated test build documented in the README.',
  );

  test('requires consent, opens an editable checklist draft, and forgets the key on reload', async ({
    page,
  }) => {
    const owner = '72efe2bc-f793-4205-b2db-32a49f4f2b1b';
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const token = `${encode({ alg: 'HS256' })}.${encode({ sub: owner, exp: expires, role: 'authenticated' })}.synthetic`;
    const apiKey = 'synthetic-key-only-for-this-test';
    const user = {
      id: owner,
      email: 'auditor@example.test',
      role: 'authenticated',
      aud: 'authenticated',
      user_metadata: { display_name: 'Тестовый аудитор' },
      app_metadata: {},
      created_at: '2026-11-20T00:00:00.000Z',
    };
    const date = '2026-11-20';
    const timestamp = `${date}T00:00:00.000Z`;
    const snapshotId = '132eee21-93ef-48c5-a6ba-66a2efc47da9';
    const auditId = '436e2931-5039-495f-a8c1-9c3bf8994812';
    const question = {
      id: '1ac9b352-7201-42d8-80a3-dc9168da0ddf',
      title: 'Выход свободен?',
      description: '',
      type: 'boolean',
      required: true,
      weight: 1,
      severity: 'high',
      options: [],
    };
    const example = [
      {
        id: snapshotId,
        kind: 'snapshot',
        data: {
          name: 'Безопасность объекта',
          description: '',
          templateId: 'deddb06d-e4e9-4d9a-ae0f-a4187146fc71',
          number: 1,
          sections: [
            {
              id: 'd5f72231-8b0a-481b-a680-eed8f075a3f2',
              title: 'Проходы',
              questions: [question],
            },
          ],
        },
      },
      {
        id: auditId,
        kind: 'audit',
        data: {
          snapshotId,
          title: 'Проверка выхода',
          entity: 'Скрытый объект',
          location: 'Скрытый адрес',
          notes: 'Скрытые заметки',
          date,
          status: 'completed',
          events: [{ at: timestamp, status: 'completed' }],
        },
      },
      {
        id: '47d165c6-6803-41ee-8278-dfb64cbdd73e',
        kind: 'answer',
        data: {
          auditId,
          questionId: question.id,
          value: 'no',
          notes: 'Скрытые заметки к ответу',
        },
      },
    ].map((row, index) => ({
      ...row,
      revision: index + 1,
      version: 1,
      deleted: false,
      updated_at: timestamp,
    }));
    let generations = 0;

    await page.route(
      'https://auditflow-fixture.supabase.co/**',
      async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const { pathname: path } = url;
        if (request.method() === 'OPTIONS') {
          await route.fulfill({
            status: 204,
            headers: {
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'GET, POST, OPTIONS',
              'access-control-allow-headers':
                request.headers()['access-control-request-headers'] ?? '*',
            },
          });
          return;
        }
        if (path === '/rest/v1/rpc/apply_auditflow_mutation') {
          const change = request.postDataJSON();
          await route.fulfill({
            json: {
              state: 'applied',
              row: {
                id: change.p_id,
                kind: change.p_kind,
                data: change.p_data,
                deleted: change.p_deleted,
                version: change.p_base + 1,
                revision: 4,
                updated_at: timestamp,
              },
            },
            headers: { 'access-control-allow-origin': '*' },
          });
          return;
        }
        const json =
          path === '/auth/v1/token'
            ? {
                user,
                access_token: token,
                refresh_token: 'synthetic-refresh-token',
                token_type: 'bearer',
                expires_in: 3600,
                expires_at: expires,
              }
            : path === '/auth/v1/user'
              ? user
              : path === '/rest/v1/auditflow_records'
                ? example.filter(
                    (row) =>
                      row.revision >
                      Number(url.searchParams.get('revision')?.slice(3) ?? 0),
                  )
                : [];
        await route.fulfill({
          json,
          headers: { 'access-control-allow-origin': '*' },
        });
      },
    );
    await page.route('**/api/ai', async (route) => {
      generations++;
      expect(route.request().headers().authorization).toBe(`Bearer ${token}`);
      const payload = route.request().postDataJSON();
      expect(payload).toMatchObject({
        locale: 'ru',
        config: { provider: 'openai', apiKey },
      });
      if (payload.task === 'report') {
        expect(payload.context).toBe('Проверенный текст: выход заблокирован.');
        await route.fulfill({
          json: {
            task: 'report',
            proposal: { text: 'Требуется повторная проверка выхода.' },
          },
        });
        return;
      }
      expect(payload).toMatchObject({ task: 'checklist', context: '' });
      await route.fulfill({
        json: {
          task: 'checklist',
          proposal: {
            name: 'Проверка мастерской',
            description: 'Еженедельный осмотр.',
            sections: [
              {
                title: 'Выходы',
                questions: [
                  {
                    title: 'Проход свободен?',
                    description: '',
                    type: 'boolean',
                    required: true,
                    weight: 1,
                    severity: 'high',
                  },
                ],
              },
            ],
          },
        },
      });
    });

    await page.goto('/login');
    await page
      .getByRole('textbox', { name: 'Электронная почта' })
      .fill(user.email);
    await page.getByLabel('Пароль', { exact: true }).fill('synthetic-password');
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('link', { name: 'ИИ-помощник', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Режим ИИ' })
      .selectOption('assistant');
    await page.getByLabel('Ключ API', { exact: true }).fill(apiKey);
    await page
      .getByRole('button', { name: 'Использовать ключ в этом сеансе' })
      .click();
    await page
      .getByRole('textbox', { name: 'С чем помочь?' })
      .fill('Составь еженедельный чек-лист мастерской.');
    await expect(
      page.getByRole('button', { name: 'Отправить провайдеру OpenAI' }),
    ).toBeDisabled();
    expect(generations).toBe(0);
    await page.getByRole('checkbox', { name: /Я проверил текст/ }).check();
    await page
      .getByRole('button', { name: 'Отправить провайдеру OpenAI' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Предложение ИИ' }),
    ).toBeVisible();
    expect(generations).toBe(1);
    expect(
      await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
        }),
      ),
    ).not.toContain(apiKey);

    await page
      .getByRole('button', { name: 'Открыть в редакторе чек-листа' })
      .click();
    const name = page.getByRole('textbox', { name: 'Название чек-листа' });
    await expect(name).toHaveValue('Проверка мастерской');
    await page
      .getByRole('link', { name: 'Чек-листы', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('link', { name: /Проверка мастерской/ }),
    ).toHaveCount(0);
    await page
      .getByRole('link', { name: 'Новый чек-лист', exact: true })
      .first()
      .click();
    await name.fill('Проверка мастерской — проверено');
    await page
      .getByRole('button', { name: 'Сохранить черновик', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Редактирование чек-листа' }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'ИИ-помощник', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Выберите ИИ-инструмент' })
      .selectOption('report');
    await page
      .getByRole('combobox', { name: 'Проверка', exact: true })
      .selectOption(auditId);
    const preview = page.getByRole('textbox', { name: 'Текст для отправки' });
    await expect(preview).toHaveValue(/Выход свободен\? — Нет/);
    expect(await preview.inputValue()).not.toMatch(/Скрыт/);
    await page.getByRole('checkbox', { name: /Я проверил текст/ }).check();
    await preview.fill('Проверенный текст: выход заблокирован.');
    const send = page.getByRole('button', {
      name: 'Отправить провайдеру OpenAI',
    });
    await expect(send).toBeDisabled();
    await page.getByRole('checkbox', { name: /Я проверил текст/ }).check();
    await send.click();
    await page
      .getByRole('button', {
        name: 'Открыть в предварительном просмотре отчёта',
      })
      .click();
    const conclusion = page.getByRole('textbox', {
      name: 'Вывод, подготовленный с ИИ',
    });
    await expect(conclusion).toHaveValue(
      'Требуется повторная проверка выхода.',
    );
    await conclusion.fill(
      'Повторно проверить выход после устранения замечания.',
    );
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Скачать Excel' }).click();
    const workbook = new Workbook();
    await workbook.xlsx.readFile((await (await download).path())!);
    const reportRows = workbook.getWorksheet('Сводка')?.getSheetValues();
    expect(JSON.stringify(reportRows)).toContain(
      'Повторно проверить выход после устранения замечания.',
    );
    await page.emulateMedia({ media: 'print' });
    await expect(conclusion).toBeHidden();
    await expect(
      page.getByRole('paragraph').filter({
        hasText: 'Повторно проверить выход после устранения замечания.',
      }),
    ).toBeVisible();

    await page.goto('/settings/ai');
    await expect(page.getByRole('combobox', { name: 'Режим ИИ' })).toHaveValue(
      'manual',
    );
    await page
      .getByRole('combobox', { name: 'Режим ИИ' })
      .selectOption('assistant');
    await expect(page.getByLabel('Ключ API', { exact: true })).toHaveValue('');
    await expect(page.getByText(/Ключ введён для текущего сеанса/)).toHaveCount(
      0,
    );
  });
});
