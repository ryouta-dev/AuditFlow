import { readFile } from 'node:fs/promises';
import { expect, test, devices, type Page } from '@playwright/test';
import { Workbook } from 'exceljs';

async function openEnglishDemo(page: Page) {
  await page.goto('/login');
  await page
    .getByRole('combobox', { name: 'Язык интерфейса' })
    .selectOption('en');
  await page.getByRole('button', { name: 'Explore the demo' }).click();
}

test('publishes a checklist, saves offline through reload, finalizes, and exports actual results', async ({
  page,
  context,
}, info) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await openEnglishDemo(page);
  await expect(
    page.getByRole('heading', { name: 'Overview', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath('dashboard.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Checklists', exact: true }).click();
  await page.getByRole('link', { name: 'New checklist', exact: true }).click();
  await page.getByLabel('Checklist name').fill('Қауіпсіздік чек-листі');
  await page.getByLabel('Section name').fill('Выходы и проходы');
  await page.getByLabel('Question title').fill('Өрт шығу жолы ашық па?');
  await page.getByLabel('Question weight').fill('3');
  await page
    .getByRole('button', { name: 'Publish checklist', exact: true })
    .click();
  await expect(page.getByText('Version 1', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Inspections', exact: true }).click();
  await page.getByRole('link', { name: 'New inspection', exact: true }).click();
  const checklist = page.getByRole('combobox', {
    name: 'Checklist',
    exact: true,
  });
  await checklist.selectOption({ label: 'Қауіпсіздік чек-листі' });
  await page.getByLabel('Inspection title').fill('Қойма тексерісі');
  await page.getByLabel('Inspected entity').fill('Склад № 2');
  await page.getByRole('button', { name: 'Start inspection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Қойма тексерісі' }),
  ).toBeVisible();
  const auditUrl = page.url();
  await page
    .getByRole('button', { name: 'Complete inspection', exact: true })
    .click();
  await expect(
    page.getByText('Answer the required questions before completing.'),
  ).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByLabel('Sync status: Offline')).toBeVisible();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Notes for Өрт шығу жолы ашық па?' })
    .fill('Қауіпсіздік тексерілді. Выход открыт.');
  await expect(
    page.getByText('Saved on this device', { exact: true }),
  ).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('button', { name: 'Yes', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('textbox', { name: 'Notes for Өрт шығу жолы ашық па?' }),
  ).toHaveValue('Қауіпсіздік тексерілді. Выход открыт.');
  await page
    .getByRole('button', { name: 'Complete inspection', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Yes', exact: true }),
  ).toBeDisabled();
  await page.getByRole('link', { name: 'View report', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Inspection report', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Қауіпсіздік тексерілді. Выход открыт.' }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Excel' }).click();
  const download = await downloadPromise;
  const filename = info.outputPath('inspection.xlsx');
  await download.saveAs(filename);
  const workbook = new Workbook();
  await workbook.xlsx.readFile(filename);
  expect(workbook.getWorksheet('Responses')?.getRow(2).values).toEqual([
    undefined,
    'Выходы и проходы',
    'Өрт шығу жолы ашық па?',
    'Yes',
    'Yes',
    3,
    100,
    'Қауіпсіздік тексерілді. Выход открыт.',
  ]);
  const pdf = info.outputPath('inspection.pdf');
  await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
  expect((await readFile(pdf)).subarray(0, 4).toString()).toBe('%PDF');
  await context.setOffline(false);
  await expect(page.getByLabel('Sync status: Local workspace')).toBeVisible();

  await page.goto(auditUrl);
  await page
    .getByRole('article')
    .getByRole('link', { name: 'Record finding' })
    .click();
  await page
    .getByRole('textbox', { name: 'Finding title' })
    .fill('Replace faded exit signs');
  await page.getByRole('button', { name: 'Save finding' }).click();
  await expect(
    page.getByRole('heading', { name: 'Replace faded exit signs' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add corrective action' }).click();
  await page
    .getByRole('textbox', { name: 'Corrective action', exact: true })
    .fill('Install new signs');
  await page
    .getByRole('combobox', { name: 'Action status' })
    .selectOption('verified');
  await page.getByRole('button', { name: 'Save corrective action' }).click();
  await expect(
    page.getByText('Add a verification note before recording the outcome.'),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Verification note' })
    .fill('Checked in person.');
  await page.getByRole('button', { name: 'Save corrective action' }).click();
  await expect(
    page.getByText('Corrective action saved locally.'),
  ).toBeVisible();
  await page.goto(auditUrl);
  await page.getByRole('link', { name: 'View report', exact: true }).click();
  await expect(page.getByText('Install new signs')).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test('opens an inspection from the phone navigation and keeps fields within the viewport', async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({ ...devices['Pixel 7'], baseURL });
  try {
    const page = await context.newPage();
    await openEnglishDemo(page);
    await expect(
      page.getByRole('heading', { name: 'Overview', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath('mobile.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Inspections', exact: true }).click();
    await page
      .getByRole('link', {
        name: /Warehouse safety inspection North Warehouse/,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Warehouse safety inspection' }),
    ).toBeVisible();
    await expect(page.getByRole('progressbar')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  } finally {
    await context.close();
  }
});

for (const sample of [
  {
    locale: 'ru',
    demo: 'Открыть демо',
    login: 'С возвращением',
    overview: 'Обзор',
    checklists: 'Чек-листы',
    newChecklist: 'Новый чек-лист',
    publish: 'Опубликовать чек-лист',
    validation: 'Укажите название чек-листа.',
    reports: 'Отчёты',
    example: 'Проверка производственного оборудования',
    report: 'Отчёт о проверке',
    download: 'Скачать Excel',
    sheets: ['Сводка', 'Ответы', 'Замечания и CAPA'],
    question: 'Вопрос',
    yes: 'Да',
  },
  {
    locale: 'kk',
    demo: 'Демоны ашу',
    login: 'Қош келдіңіз',
    overview: 'Шолу',
    checklists: 'Тексеру тізімдері',
    newChecklist: 'Жаңа тексеру тізімі',
    publish: 'Тізімді жариялау',
    validation: 'Тексеру тізіміне атау беріңіз.',
    reports: 'Есептер',
    example: 'Өндірістік жабдықты тексеру',
    report: 'Тексеру есебі',
    download: 'Excel жүктеп алу',
    sheets: ['Жиынтық', 'Жауаптар', 'Сәйкессіздіктер және CAPA'],
    question: 'Сұрақ',
    yes: 'Иә',
  },
] as const) {
  test(`localizes authentication, validation, and offline exports in ${sample.locale}`, async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await page
      .getByRole('combobox', { name: 'Язык интерфейса' })
      .selectOption(sample.locale);
    await expect(
      page.getByRole('heading', { name: sample.login, exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: sample.demo }).click();
    await expect(
      page.getByRole('heading', { name: sample.overview, exact: true }),
    ).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', sample.locale);

    await page
      .getByRole('link', { name: sample.checklists, exact: true })
      .click();
    await page
      .getByRole('link', { name: sample.newChecklist, exact: true })
      .click();
    await page
      .getByRole('button', { name: sample.publish, exact: true })
      .click();
    await expect(page.getByText(sample.validation)).toBeVisible();

    await page.getByRole('link', { name: sample.reports, exact: true }).click();
    await page.getByRole('link', { name: new RegExp(sample.example) }).click();
    await expect(
      page.getByRole('heading', { name: sample.report, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', sample.locale);
    await expect(
      page.getByRole('columnheader', { name: sample.question }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: sample.yes, exact: true }).first(),
    ).toBeVisible();

    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: sample.download }).click();
    const path = await (await downloaded).path();
    expect(path).toBeTruthy();
    const workbook = new Workbook();
    await workbook.xlsx.readFile(path!);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(
      sample.sheets,
    );
    expect(workbook.getWorksheet(sample.sheets[1])?.getCell('C2').value).toBe(
      sample.yes,
    );
  });
}
