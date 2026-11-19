import {
  blankQuestion,
  localDate,
  optionsFor,
  type Change,
  type Data,
  type Question,
} from './domain';
import { recordId } from './local';
import { defaultLocale, translate, type Locale, type Message } from './i18n';

const checklistNames = [
  'Workplace safety',
  'Equipment inspection',
  'Facility readiness',
  'Documentation review',
] as const;
const topics = [
  [
    'Exits and walkways are unobstructed',
    'Fire extinguishers are accessible and in date',
    'Personal protective equipment is available',
  ],
  [
    'Equipment is free of visible damage',
    'Emergency stop functions correctly',
    'Maintenance records are current',
  ],
  [
    'Work areas are clean and organized',
    'Lighting is adequate for the task',
    'Access controls are functioning',
  ],
  [
    'Current procedures are available',
    'Training records are up to date',
    'Changes have been reviewed and approved',
  ],
] as const;
const scopes = [
  'Review common hazards and confirm basic safety controls.',
  'Verify condition, safeguards and maintenance records.',
  'Review the condition and accessibility of work areas.',
  'Check operational procedures and training records.',
] as const;

export async function demoChanges(
  locale: Locale = defaultLocale,
): Promise<Change[]> {
  const t = translate(locale);
  const changes: Change[] = [];
  const date = (months: number, day: number) => {
    const now = new Date();
    return localDate(
      new Date(
        now.getFullYear(),
        now.getMonth() + months,
        months === 0 ? Math.max(1, now.getDate() + day) : day,
      ),
    );
  };
  const at = (day: string) => `${day}T09:30:00.000Z`;
  const versions = checklistNames.map((name, i) => {
    const templateId = crypto.randomUUID();
    const snapshotId = crypto.randomUUID();
    const questions: Question[] = topics[i].map((title, j) => ({
      ...blankQuestion(),
      title: t(title),
      weight: j === 0 ? 3 : j === 1 ? 2 : 1,
      severity: j === 0 ? 'high' : 'medium',
    }));
    const rating: Question = {
      ...blankQuestion(),
      title: t('Overall condition'),
      type: 'rating',
      weight: 4,
      options: optionsFor('rating').map((option, rank) => ({
        ...option,
        score: rank / 4,
      })),
    };
    const observation: Question = {
      ...blankQuestion(),
      title: t('Other observations'),
      type: 'text',
      required: false,
    };
    const blueprint = {
      name: t(name),
      description: t(scopes[i]),
      sections: [
        { id: crypto.randomUUID(), title: t('Control checks'), questions },
        {
          id: crypto.randomUUID(),
          title: t('Condition and notes'),
          questions: [rating, observation],
        },
      ],
    };
    changes.push(
      {
        id: templateId,
        kind: 'template',
        data: { ...blueprint, status: 'draft' },
      },
      {
        id: snapshotId,
        kind: 'snapshot',
        data: { ...blueprint, templateId, number: 1 },
      },
      {
        id: templateId,
        kind: 'template',
        data: { ...blueprint, status: 'published' },
      },
    );
    return { id: snapshotId, questions: [...questions, rating, observation] };
  });
  const schedule = [
    {
      title: 'Warehouse safety inspection',
      entity: 'North Warehouse',
      version: 0,
      month: 0,
      day: 0,
      status: 'in_progress',
      rating: 4,
    },
    {
      title: 'Production equipment check',
      entity: 'Production Floor A',
      version: 1,
      month: 0,
      day: -2,
      status: 'completed',
      rating: 4,
    },
    {
      title: 'Monthly facility walkthrough',
      entity: 'Admin Building',
      version: 2,
      month: 0,
      day: -4,
      status: 'completed',
      rating: 5,
    },
    {
      title: 'Training records review',
      entity: 'Operations Office',
      version: 3,
      month: 0,
      day: -5,
      status: 'draft',
      rating: 0,
    },
    {
      title: 'Loading dock safety review',
      entity: 'East Loading Dock',
      version: 0,
      month: -1,
      day: 22,
      status: 'in_progress',
      rating: 4,
    },
    {
      title: 'Site operating procedures',
      entity: 'Operations Office',
      version: 3,
      month: -1,
      day: 18,
      status: 'completed',
      rating: 4,
    },
    {
      title: 'Workshop equipment checks',
      entity: 'Central Workshop',
      version: 1,
      month: -2,
      day: 19,
      status: 'completed',
      rating: 5,
    },
    {
      title: 'Facility readiness inspection',
      entity: 'Admin Building',
      version: 2,
      month: -2,
      day: 8,
      status: 'completed',
      rating: 4,
    },
    {
      title: 'Service corridor walkthrough',
      entity: 'West Service Block',
      version: 2,
      month: -3,
      day: 17,
      status: 'completed',
      rating: 3,
    },
    {
      title: 'Operator training review',
      entity: 'Central Workshop',
      version: 3,
      month: -4,
      day: 21,
      status: 'completed',
      rating: 4,
    },
    {
      title: 'Stockroom safety review',
      entity: 'North Warehouse',
      version: 0,
      month: -4,
      day: 13,
      status: 'completed',
      rating: 3,
    },
    {
      title: 'Equipment commissioning check',
      entity: 'Production Floor A',
      version: 1,
      month: -5,
      day: 12,
      status: 'completed',
      rating: 3,
    },
  ] as const;

  for (const [i, item] of schedule.entries()) {
    const auditId = crypto.randomUUID();
    const version = versions[item.version];
    const day = date(item.month, item.day);
    const initial = item.status === 'draft' ? 'draft' : 'in_progress';
    const data: Data<'audit'> = {
      snapshotId: version.id,
      title: t(item.title),
      entity: t(item.entity),
      location: '',
      date: day,
      notes: '',
      status: initial,
      events: [{ status: initial, at: at(day) }],
    };
    changes.push({ id: auditId, kind: 'audit', data });
    const count =
      item.status === 'completed' ? 4 : item.status === 'in_progress' ? 2 : 0;
    for (const [j, question] of version.questions.slice(0, count).entries()) {
      const value =
        j === 3
          ? question.options[item.rating - 1].id
          : j === 2 && [5, 8, 10, 11].includes(i)
            ? 'no'
            : 'yes';
      changes.push({
        id: await recordId(auditId, question.id),
        kind: 'answer',
        data: {
          auditId,
          questionId: question.id,
          value,
          notes: value === 'no' ? t('A follow-up review is required.') : '',
        },
      });
    }
    if (item.status === 'completed')
      changes.push({
        id: auditId,
        kind: 'audit',
        data: {
          ...data,
          status: 'completed',
          events: [...data.events, { status: 'completed', at: at(day) }],
        },
      });
    if ([0, 5, 8].includes(i)) {
      const id = crypto.randomUUID();
      const titles: Record<number, Message> = {
        0: 'Replace worn exit signage',
        5: 'Review outdated operating procedure',
        8: 'Improve service corridor lighting',
      };
      const finding: Data<'finding'> = {
        auditId,
        questionId: null,
        title: t(titles[i]),
        details: t(
          'Identified during the walkthrough. Confirm remediation during follow-up.',
        ),
        severity: i === 0 ? 'high' : 'medium',
        status: 'open',
      };
      const action: Data<'capa'> = {
        findingId: id,
        rootCause: t('Routine review was missed.'),
        corrective: finding.title,
        preventive: t('Add the control to the monthly review.'),
        assignee: t('Site coordinator'),
        dueDate: date(i === 0 ? 1 : -1, 27),
        status: i === 5 ? 'in_progress' : 'open',
        verification: '',
        events: [{ status: i === 5 ? 'in_progress' : 'open', at: at(day) }],
      };
      changes.push(
        { id, kind: 'finding', data: finding },
        { id: await recordId(id, 'capa'), kind: 'capa', data: action },
      );
    }
  }
  return changes;
}
