import { z } from 'zod';
import { translate, type Message, type Translate } from './i18n';

export const types = [
  'boolean',
  'text',
  'number',
  'date',
  'rating',
  'select',
  'multiselect',
] as const;
export const severities = ['low', 'medium', 'high', 'critical'] as const;
export const inspectionStatuses = [
  'draft',
  'in_progress',
  'completed',
  'archived',
] as const;
export const capaStatuses = [
  'open',
  'in_progress',
  'pending_verification',
  'verified',
  'ineffective',
  'closed',
] as const;
export const typeLabel = {
  boolean: 'Yes / No / N/A',
  text: 'Text',
  number: 'Number',
  date: 'Date',
  rating: 'Rating (1–5)',
  select: 'Single choice',
  multiselect: 'Multiple choice',
} as const;
const statusKeys: Readonly<Partial<Record<string, Message>>> = {
  draft: 'Draft',
  in_progress: 'In progress',
  completed: 'Completed',
  archived: 'Archived',
  published: 'Published',
  open: 'Open',
  closed: 'Closed',
  pending_verification: 'Pending verification',
  verified: 'Verified',
  ineffective: 'Ineffective',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export function statusLabel(t: Translate, status: string) {
  const key = statusKeys[status];
  return key ? t(key) : status;
}

const uuid = z.uuid();
const date = z.iso.date();
const timestamp = z.iso.datetime();
const name = z.string().max(160);
const note = z.string().max(4000);
const option = z.object({
  id: uuid,
  label: name,
  score: z.number().min(0).max(1).nullable(),
});
const question = z.object({
  id: uuid,
  title: name,
  description: note,
  type: z.enum(types),
  required: z.boolean(),
  weight: z.number().gt(0).max(1000),
  severity: z.enum(severities),
  options: z.array(option).max(30),
});
const section = z.object({
  id: uuid,
  title: name,
  questions: z.array(question).max(80),
});
const blueprint = z.object({
  name,
  description: note,
  sections: z.array(section).max(20),
});
const event = z.object({ status: z.enum(inspectionStatuses), at: timestamp });

export const schemas = {
  template: blueprint.extend({
    status: z.enum(['draft', 'published', 'archived']),
  }),
  snapshot: blueprint.extend({ templateId: uuid, number: z.int().positive() }),
  audit: z.object({
    snapshotId: uuid,
    title: name.trim().min(1),
    entity: name.trim().min(1),
    location: name,
    date,
    notes: note,
    status: z.enum(inspectionStatuses),
    events: z.array(event).min(1).max(1000),
  }),
  answer: z.object({
    auditId: uuid,
    questionId: uuid,
    value: z.union([
      z.string().max(4000),
      z.number(),
      z.array(uuid).max(30),
      z.null(),
    ]),
    notes: note,
  }),
  finding: z.object({
    auditId: uuid,
    questionId: uuid.nullable(),
    title: name.trim().min(1),
    details: note,
    severity: z.enum(severities),
    status: z.enum(['open', 'closed']),
  }),
  capa: z.object({
    findingId: uuid,
    rootCause: note,
    corrective: note,
    preventive: note,
    assignee: name,
    dueDate: z.union([z.literal(''), date]),
    status: z.enum(capaStatuses),
    verification: note,
    events: z
      .array(z.object({ status: z.enum(capaStatuses), at: timestamp }))
      .min(1)
      .max(1000),
  }),
};

export type Question = z.infer<typeof question>;
export type Section = z.infer<typeof section>;
export type Blueprint = z.infer<typeof blueprint>;
export type Kind = keyof typeof schemas;
export type Data<K extends Kind> = z.infer<(typeof schemas)[K]>;
export type Row<K extends Kind = Kind> = K extends Kind
  ? {
      id: string;
      kind: K;
      version: number;
      revision: number;
      deleted: boolean;
      updatedAt: string;
      data: Data<K>;
    }
  : never;
export type Change<K extends Kind = Kind> = K extends Kind
  ? Pick<Row<K>, 'id' | 'kind' | 'data'> & { deleted?: boolean }
  : never;
export type Answers = Record<string, Row<'answer'> | undefined>;

export function rowsOf<K extends Kind>(rows: Row[], kind: K): Row<K>[] {
  return rows.filter((row): row is Row<K> => row.kind === kind && !row.deleted);
}

export function localDate(value = new Date()) {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function formatDate(
  value: string,
  locale = 'en',
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
) {
  return new Intl.DateTimeFormat(locale, options).format(
    new Date(value.length === 10 ? `${value}T12:00:00` : value),
  );
}

export function blankQuestion(): Question {
  return {
    id: crypto.randomUUID(),
    title: '',
    description: '',
    type: 'boolean',
    required: true,
    weight: 1,
    severity: 'low',
    options: [],
  };
}

export function optionsFor(type: Question['type']): Question['options'] {
  if (type === 'rating')
    return Array.from({ length: 5 }, (_, i) => ({
      id: crypto.randomUUID(),
      label: String(i + 1),
      score: null,
    }));
  if (type === 'select' || type === 'multiselect')
    return Array.from({ length: 2 }, () => ({
      id: crypto.randomUUID(),
      label: '',
      score: null,
    }));
  return [];
}

export function validateBlueprint(
  data: Blueprint,
  t = translate('en'),
): string | null {
  if (!blueprint.safeParse(data).success)
    return t('Check field lengths, weights, and checklist limits.');
  if (!data.name.trim()) return t('Give the checklist a name.');
  if (!data.sections.length) return t('Add at least one section.');
  const ids = new Set<string>();
  for (const block of data.sections) {
    if (!block.title.trim() || !block.questions.length)
      return t('Give every section a name and at least one question.');
    if (ids.has(block.id)) return t('Section and question IDs must be unique.');
    ids.add(block.id);
    for (const item of block.questions) {
      if (!item.title.trim()) return t('Give every question a title.');
      if (ids.has(item.id))
        return t('Section and question IDs must be unique.');
      ids.add(item.id);
      if (['rating', 'select', 'multiselect'].includes(item.type)) {
        const labels = item.options.map((entry) =>
          entry.label.trim().toLowerCase(),
        );
        if (
          labels.length < 2 ||
          labels.some((label) => !label) ||
          new Set(labels).size !== labels.length ||
          new Set(item.options.map((entry) => entry.id)).size !== labels.length
        )
          return t('Enter distinct options for “{name}”.', {
            name: item.title,
          });
        if (item.type === 'rating' && labels.join(',') !== '1,2,3,4,5')
          return t('Ratings must use the 1–5 scale.');
        const scored = item.options.filter(
          (entry) => entry.score !== null,
        ).length;
        if (scored && scored !== labels.length)
          return t('Score every option or clear all scores for “{name}”.', {
            name: item.title,
          });
      } else if (item.options.length)
        return t('Only choice and rating questions accept options.');
    }
  }
  return null;
}

export function answerIndex(rows: Row<'answer'>[], auditId: string): Answers {
  return Object.fromEntries(
    rows
      .filter((row) => row.data.auditId === auditId)
      .map((row) => [row.data.questionId, row]),
  );
}

export function answered(value: Data<'answer'>['value'] | undefined) {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

export function scoreFor(
  item: Question,
  value: Data<'answer'>['value'] | undefined,
): number | null {
  if (!answered(value)) return null;
  if (item.type === 'boolean')
    return value === 'yes' ? 1 : value === 'no' ? 0 : null;
  if (
    !item.options.length ||
    item.options.some((entry) => entry.score === null)
  )
    return null;
  const selected = Array.isArray(value) ? value : [value];
  const scores = selected.map(
    (id) => item.options.find((entry) => entry.id === id)?.score,
  );
  if (scores.some((part) => part === undefined || part === null)) return null;
  return (
    scores.reduce<number>((total, part) => total + (part ?? 0), 0) /
    scores.length
  );
}

export function summarize(blueprint: Blueprint, answers: Answers) {
  let achieved = 0,
    possible = 0,
    count = 0,
    required = 0,
    requiredAnswered = 0,
    incompleteScored = 0;
  const questions = blueprint.sections.flatMap((block) => block.questions);
  const missing: Question[] = [];
  for (const item of questions) {
    const value = answers[item.id]?.data.value;
    if (item.required) required++;
    if (answered(value)) {
      count++;
      if (item.required) requiredAnswered++;
    } else {
      if (item.required) missing.push(item);
      if (
        item.type === 'boolean' ||
        item.options.some((entry) => entry.score !== null)
      )
        incompleteScored++;
    }
    const score = scoreFor(item, value);
    if (score !== null) {
      achieved += item.weight * score;
      possible += item.weight;
    }
  }
  return {
    score: possible ? Math.round((1000 * achieved) / possible) / 10 : null,
    achieved,
    possible,
    count,
    total: questions.length,
    required,
    requiredAnswered,
    missing,
    incompleteScored,
  };
}

export function responseLabel(
  item: Question,
  value: Data<'answer'>['value'] | undefined,
  t = translate('en'),
) {
  if (!answered(value)) return t('Unanswered');
  if (item.type === 'boolean')
    return t(value === 'yes' ? 'Yes' : value === 'no' ? 'No' : 'N/A');
  if (Array.isArray(value))
    return value
      .map((id) => item.options.find((entry) => entry.id === id)?.label ?? id)
      .join(', ');
  return (
    item.options.find((entry) => entry.id === value)?.label ?? String(value)
  );
}

export function hasFinalReport(audit: Data<'audit'>) {
  return (
    audit.status === 'completed' ||
    (audit.status === 'archived' && audit.events.at(-2)?.status === 'completed')
  );
}
