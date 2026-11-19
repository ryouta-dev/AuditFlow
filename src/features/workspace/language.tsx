'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  defaultLocale,
  localeNames,
  translate,
  type Locale,
  type Translate,
} from '@/lib/i18n';

const preferenceKey = 'auditflow:language';
const changeEvent = 'auditflow:language-change';
const Language = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}>({ locale: defaultLocale, setLocale: () => {}, t: translate(defaultLocale) });

function listen(change: () => void) {
  window.addEventListener('storage', change);
  window.addEventListener(changeEvent, change);
  return () => {
    window.removeEventListener('storage', change);
    window.removeEventListener(changeEvent, change);
  };
}

export function LanguageProvider({
  owner,
  children,
}: {
  owner?: string;
  children: ReactNode;
}) {
  const ownerKey = owner ? `auditflow:locale:${owner}` : null;
  const locale = useSyncExternalStore(
    listen,
    () => {
      const selected =
        localStorage.getItem(preferenceKey) ??
        (ownerKey && localStorage.getItem(ownerKey));
      return selected === 'en' || selected === 'kk' || selected === 'ru'
        ? selected
        : defaultLocale;
    },
    () => defaultLocale,
  );
  const t = useMemo(() => translate(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `AuditFlow | ${t('Inspection workspace')}`;
  }, [locale, t]);

  return (
    <Language.Provider
      value={{
        locale,
        t,
        setLocale(next) {
          localStorage.setItem(preferenceKey, next);
          window.dispatchEvent(new Event(changeEvent));
        },
      }}
    >
      {children}
    </Language.Provider>
  );
}

export function useLanguage() {
  return useContext(Language);
}

export function LanguageSelect() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <label>
      {t('Workspace language')}
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {Object.entries(localeNames).map(([value, name]) => (
          <option value={value} lang={value} key={value}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
