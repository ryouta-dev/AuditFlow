import { messages } from './messages';

export const localeNames = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
} as const;
export type Locale = keyof typeof localeNames;
export const defaultLocale: Locale = 'ru';
export type Message = keyof typeof messages;
export type Translate = (
  key: Message,
  params?: Record<string, string | number>,
) => string;

export function translate(locale: Locale): Translate {
  return (key, params) => {
    const text = locale === 'en' ? key : messages[key][locale === 'ru' ? 0 : 1];
    return params
      ? text.replace(/\{(\w+)\}/g, (match, name: string) =>
          String(params[name] ?? match),
        )
      : text;
  };
}

export function localizeError(t: Translate, error: unknown, fallback: Message) {
  const text =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : '';
  if (Object.hasOwn(messages, text)) return t(text as Message);
  if (error && typeof error === 'object') {
    const code = 'code' in error ? error.code : undefined;
    if (code === 'invalid_credentials') return t('Invalid login credentials');
    if (code === 'email_not_confirmed') return t('Email not confirmed');
    if ('status' in error && error.status === 429)
      return t('Too many requests. Try again later.');
  }
  return t(fallback);
}

export function formatPercent(score: number, locale: Locale) {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(score / 100);
}
