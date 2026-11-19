import { Workbook, type Worksheet } from 'exceljs';
import {
  conformityOptions,
  formatDate,
  statusLabel,
  type Row,
  type summarizeConformity,
} from '@/lib/domain';
import { translate, type Locale } from '@/lib/i18n';

type WorkbookInput = {
  audit: Row<'audit'>;
  version: Row<'snapshot'>;
  date: string;
  score: number | null;
  outcomes?: ReturnType<typeof summarizeConformity>;
  answered: number;
  total: number;
  data: {
    section: string;
    question: string;
    method: string;
    source: string;
    response: string;
    notes: string;
    required: boolean;
    weight: number;
    score: number | null;
  }[];
  findings: { finding: Row<'finding'>; action?: Row<'capa'> }[];
  provisional: boolean;
  methodology: string;
  locale: Locale;
  conclusion?: string;
};

function setup(
  sheet: Worksheet,
  title: string,
  headers: { header: string; width: number }[],
  rows: (string | number | null)[][],
) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  headers.forEach(({ width }, i) => {
    sheet.getColumn(i + 1).width = width;
  });
  if (rows.length)
    sheet.addTable({
      name: title,
      ref: 'A1',
      headerRow: true,
      columns: headers.map(({ header }) => ({ name: header })),
      rows,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
    });
  else sheet.addRow(headers.map(({ header }) => header));
  sheet.getRow(1).height = 26;
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5140CC' },
    };
  });
  sheet.eachRow({ includeEmpty: false }, (row, index) => {
    if (index > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
}

export async function exportInspection({
  audit,
  version,
  date,
  score,
  outcomes,
  answered,
  total,
  data,
  findings,
  provisional,
  methodology,
  locale,
  conclusion,
}: WorkbookInput) {
  const t = translate(locale);
  const workbook = new Workbook();
  workbook.creator = 'AuditFlow';
  setup(
    workbook.addWorksheet(t('Summary')),
    'InspectionSummary',
    [
      { header: t('Field'), width: 27 },
      { header: t('Value'), width: 85 },
    ],
    [
      [t('Inspection'), audit.data.title],
      [t('Entity'), audit.data.entity],
      [t('Location'), audit.data.location],
      [t('Date'), date],
      [t('Checklist'), version.data.name],
      [t('Version'), version.data.number],
      [t('Status'), statusLabel(t, audit.data.status)],
      ...(outcomes
        ? conformityOptions.map(({ label, value }) => [
            t(label),
            outcomes[value],
          ])
        : [[t('Compliance (%)'), score ?? t('N/A')]]),
      [t('Answered'), answered],
      [t('Questions'), total],
      [t('Scope'), version.data.description],
      [t('Auditor notes'), audit.data.notes],
      ...(conclusion ? [[t('AI-assisted conclusion'), conclusion]] : []),
      [t('Methodology'), methodology],
      ...(provisional
        ? [[t('Sync status'), t('Includes unsynchronized local changes')]]
        : []),
    ],
  );
  setup(
    workbook.addWorksheet(t('Responses')),
    'InspectionResponses',
    outcomes
      ? [
          { header: t('Section'), width: 25 },
          { header: t('Criterion'), width: 52 },
          { header: t('How to verify'), width: 45 },
          { header: t('Requirement reference'), width: 34 },
          { header: t('Response'), width: 29 },
          { header: t('Observation'), width: 55 },
        ]
      : [
          { header: t('Section'), width: 25 },
          { header: t('Question'), width: 52 },
          { header: t('Response'), width: 42 },
          { header: t('Required'), width: 12 },
          { header: t('Weight'), width: 12 },
          { header: t('Score (%)'), width: 14 },
          { header: t('Notes'), width: 55 },
        ],
    data.map((item) =>
      outcomes
        ? [
            item.section,
            item.question,
            item.method,
            item.source,
            item.response,
            item.notes,
          ]
        : [
            item.section,
            item.question,
            item.response,
            item.required ? t('Yes') : t('No'),
            item.weight,
            item.score !== null ? Math.round(item.score * 1000) / 10 : null,
            item.notes,
          ],
    ),
  );
  setup(
    workbook.addWorksheet(t('Findings and CAPA')),
    'InspectionFindings',
    [
      { header: t('Finding'), width: 44 },
      { header: t('Statement'), width: 50 },
      { header: t('Severity'), width: 14 },
      { header: t('Status'), width: 14 },
      { header: t('Root cause'), width: 40 },
      { header: t('Corrective action'), width: 42 },
      { header: t('Preventive action'), width: 42 },
      { header: t('Assignee'), width: 24 },
      { header: t('Due date'), width: 17 },
      { header: t('Action status'), width: 23 },
      { header: t('Verification'), width: 48 },
    ],
    findings.map(({ finding, action }) => [
      finding.data.title,
      finding.data.details,
      statusLabel(t, finding.data.severity),
      statusLabel(t, finding.data.status),
      action?.data.rootCause ?? '',
      action?.data.corrective ?? '',
      action?.data.preventive ?? '',
      action?.data.assignee ?? '',
      action?.data.dueDate ? formatDate(action.data.dueDate, locale) : '',
      action ? statusLabel(t, action.data.status) : '',
      action?.data.verification ?? '',
    ]),
  );
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
