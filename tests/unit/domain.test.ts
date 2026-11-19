import { describe, expect, it } from 'vitest';
import {
  blankQuestion,
  completionIssues,
  optionsFor,
  scoreFor,
  summarize,
  summarizeConformity,
  validateBlueprint,
  type Answers,
  type Question,
  type Row,
} from '../../src/lib/domain';

const question = (title: string, change: Partial<Question> = {}) => ({
  ...blankQuestion(),
  title,
  ...change,
});
const response = (
  item: Question,
  value: Row<'answer'>['data']['value'],
): Row<'answer'> => ({
  id: crypto.randomUUID(),
  kind: 'answer',
  version: 1,
  revision: 1,
  deleted: false,
  updatedAt: '2026-11-19T00:00:00.000Z',
  data: { auditId: crypto.randomUUID(), questionId: item.id, value, notes: '' },
});
const checklist = (...questions: Question[]) => ({
  name: 'Housing safety',
  description: '',
  sections: [{ id: crypto.randomUUID(), title: 'Safety controls', questions }],
});

describe('scoring', () => {
  it('weights applicable scored answers and excludes NA, optional unanswered, and numbers', () => {
    const heavy = question('Heavy', { weight: 2, severity: 'low' });
    const light = question('Light', { severity: 'critical' });
    const na = question('N/A', { weight: 15 });
    const optional = question('Optional', { required: false });
    const numeric = question('Temperature', { type: 'number' });
    const answers: Answers = {
      [heavy.id]: response(heavy, 'yes'),
      [light.id]: response(light, 'no'),
      [na.id]: response(na, 'na'),
      [numeric.id]: response(numeric, 0),
    };
    expect(
      summarize(checklist(heavy, light, na, optional, numeric), answers),
    ).toMatchObject({
      score: 66.7,
      achieved: 2,
      possible: 3,
      count: 4,
      required: 4,
      requiredAnswered: 4,
      incompleteScored: 1,
      missing: [],
    });
  });

  it('returns N/A with zero applicable weight and detects missing required responses', () => {
    const na = question('N/A');
    const text = question('Notes', { type: 'text' });
    expect(
      summarize(checklist(na, text), {
        [na.id]: response(na, 'na'),
        [text.id]: response(text, '  \n '),
      }),
    ).toMatchObject({ score: null, requiredAnswered: 1, missing: [text] });
  });

  it('requires all-or-none option scoring and averages selected options', () => {
    const options = optionsFor('multiselect').map((option, i) => ({
      ...option,
      label: `Option ${i + 1}`,
      score: i ? 0.5 : 1,
    }));
    const multi = question('Controls', { type: 'multiselect', options });
    expect(validateBlueprint(checklist(multi))).toBeNull();
    expect(
      scoreFor(
        multi,
        options.map((option) => option.id),
      ),
    ).toBe(0.75);
    expect(
      validateBlueprint(
        checklist({
          ...multi,
          options: [options[0], { ...options[1], score: null }],
        }),
      ),
    ).toMatch(/Score every option/);
    expect(
      validateBlueprint(
        checklist({
          ...multi,
          options: [options[0], { ...options[1], label: ' option 1 ' }],
        }),
      ),
    ).toMatch(/distinct options/);
  });
});

it('keeps unverified and not-applicable items separate and requires a reason', () => {
  const yes = question('Clear access');
  const no = question('Current instructions');
  const exception = question('Elevator inspection');
  const unverified = question('Visitor records');
  const missing = question('Maintenance log');
  const blueprint = {
    ...checklist(yes, no, exception, unverified, missing),
    assessment: 'conformity' as const,
  };
  const excluded = response(exception, 'na');
  excluded.data.notes = 'No elevator on site.';
  const answers: Answers = {
    [yes.id]: response(yes, 'yes'),
    [no.id]: response(no, 'no'),
    [exception.id]: excluded,
    [unverified.id]: response(unverified, 'unverified'),
  };
  expect(summarizeConformity(blueprint, answers)).toEqual({
    yes: 1,
    no: 1,
    na: 1,
    unverified: 1,
  });
  expect(completionIssues(blueprint, answers)).toEqual([
    { item: no, reason: 'evidence' },
    { item: unverified, reason: 'evidence' },
    { item: missing, reason: 'decision' },
  ]);
});
