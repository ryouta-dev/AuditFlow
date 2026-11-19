import { z } from 'zod';
import { severities } from '../domain';

export const providerModels = {
  openai: ['gpt-4.1-mini', 'gpt-4.1'],
  gemini: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
  openrouter: ['openai/gpt-4.1-mini', 'google/gemini-2.5-flash-lite'],
} as const;
export const providerNames = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
} as const;
const providers = ['openai', 'gemini', 'openrouter'] as const;
export const assistantTasks = [
  'checklist',
  'inspection',
  'capa',
  'report',
] as const;
export const aiTasks = [...assistantTasks, 'review'] as const;
export const maxContext = 10_000;
export const maxPrompt = 2_000;

const apiKey = z
  .string()
  .trim()
  .min(12)
  .max(512)
  .regex(/^[A-Za-z0-9_.-]+$/);

export const credentialsSchema = z
  .object({
    provider: z.enum(providers),
    model: z.string().max(90),
    apiKey,
  })
  .strict()
  .refine(
    ({ provider, model }) =>
      (providerModels[provider] as readonly string[]).includes(model),
    { path: ['model'] },
  );

export const defaultEndpoint = 'https://api.openai.com/v1/chat/completions';
export const riverEndpoint = 'https://api.river.ai/v1/chat/completions';
export const riverModel = 'deepseek-ai/DeepSeek-V4.1-Flash';

export function directEndpoint(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    return null;
  if (url.username || url.password || url.search || url.hash) return null;
  const path = url.pathname.replace(/\/+$/, '');
  if (!path) {
    url.pathname =
      url.hostname === 'openrouter.ai'
        ? '/api/v1/chat/completions'
        : url.hostname === 'generativelanguage.googleapis.com'
          ? '/v1beta/openai/chat/completions'
          : '/v1/chat/completions';
  } else if (/\/(v1|openai)$/.test(path)) {
    url.pathname = `${path}/chat/completions`;
  } else {
    url.pathname = path;
  }
  return url;
}

const directCredentialsSchema = z
  .object({
    endpoint: z.string().trim().max(512),
    model: z
      .string()
      .trim()
      .max(90)
      .regex(/^[A-Za-z0-9._:/@-]*$/),
    apiKey,
  })
  .strict()
  .transform((config, ctx) => {
    const url = directEndpoint(config.endpoint);
    if (!url) {
      ctx.addIssue({
        code: 'custom',
        path: ['endpoint'],
        message: 'Invalid endpoint',
      });
      return z.NEVER;
    }
    const suggestedModel =
      url.href === riverEndpoint
        ? riverModel
        : url.hostname === 'openrouter.ai'
          ? providerModels.openrouter[0]
          : url.hostname === 'generativelanguage.googleapis.com'
            ? providerModels.gemini[0]
            : providerModels.openai[0];
    return {
      endpoint: url.href,
      model: config.model || suggestedModel,
      apiKey: config.apiKey,
    };
  });
export { directCredentialsSchema };

const requestFields = {
  task: z.enum(aiTasks),
  locale: z.enum(['ru', 'kk', 'en']),
  prompt: z.string().trim().max(maxPrompt),
  context: z.string().trim().max(maxContext),
};

function approvedInput({
  task,
  prompt,
  context,
  config,
}: {
  task: (typeof aiTasks)[number];
  prompt: string;
  context: string;
  config: { apiKey: string };
}) {
  if (prompt.includes(config.apiKey) || context.includes(config.apiKey))
    return false;
  if (task === 'checklist') return prompt.length >= 3 || context.length >= 3;
  return context.length >= 3 && (task !== 'inspection' || prompt.length >= 3);
}

export const aiRequestSchema = z
  .object({ ...requestFields, config: credentialsSchema })
  .strict()
  .refine(approvedInput);
export const directAiRequestSchema = z
  .object({ ...requestFields, config: directCredentialsSchema })
  .strict()
  .refine(approvedInput);

const detail = z.string().trim().min(1).max(2000);
const title = z.string().trim().min(1).max(160);
const suggestedFinding = z
  .object({
    title,
    details: detail,
    severity: z.enum(severities),
  })
  .strict();

export const proposalSchemas = {
  checklist: z
    .object({
      name: title,
      description: z.string().trim().max(1500),
      sections: z
        .array(
          z
            .object({
              title,
              questions: z
                .array(
                  z
                    .object({
                      title,
                      description: z.string().trim().max(400),
                      type: z.enum(['boolean', 'text', 'number', 'date']),
                      required: z.boolean(),
                      weight: z.number().int().min(1).max(5),
                      severity: z.enum(severities),
                    })
                    .strict(),
                )
                .min(1)
                .max(5),
            })
            .strict(),
        )
        .min(1)
        .max(3),
    })
    .strict(),
  inspection: z.object({ text: detail }).strict(),
  capa: z
    .object({ rootCause: detail, corrective: detail, preventive: detail })
    .strict(),
  report: z.object({ text: detail }).strict(),
  review: z
    .object({
      findings: z.array(suggestedFinding).max(3),
      observation: z.string().trim().max(1500),
    })
    .strict(),
};

export const aiResponseSchema = z.discriminatedUnion('task', [
  z.object({
    task: z.literal('checklist'),
    proposal: proposalSchemas.checklist,
  }),
  z.object({
    task: z.literal('inspection'),
    proposal: proposalSchemas.inspection,
  }),
  z.object({ task: z.literal('capa'), proposal: proposalSchemas.capa }),
  z.object({ task: z.literal('report'), proposal: proposalSchemas.report }),
  z.object({ task: z.literal('review'), proposal: proposalSchemas.review }),
]);

export type AiConfig = z.infer<typeof credentialsSchema>;
export type DirectConfig = z.infer<typeof directCredentialsSchema>;
export type AiConnection = AiConfig | DirectConfig;
export type AiRequest = z.infer<typeof aiRequestSchema>;
export type DirectAiRequest = z.infer<typeof directAiRequestSchema>;
export type AiTask = AiRequest['task'];
export type AiResult = z.infer<typeof aiResponseSchema>;
export type SuggestedFinding = z.infer<typeof suggestedFinding>;
export type SuggestedCapa = z.infer<typeof proposalSchemas.capa>;
