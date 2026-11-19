'use client';

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useLanguage } from './language';

const preferenceKey = 'auditflow:theme';
const changeEvent = 'auditflow:theme-change';
const systemQuery = '(prefers-color-scheme: dark)';
const choices = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
} as const;
type Theme = keyof typeof choices;

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
} | null>(null);

function readTheme(): Theme {
  const stored = localStorage.getItem(preferenceKey);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function subscribe(change: () => void) {
  window.addEventListener(changeEvent, change);
  window.addEventListener('storage', change);
  return () => {
    window.removeEventListener(changeEvent, change);
    window.removeEventListener('storage', change);
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    readTheme,
    () => 'system' as const,
  );
  useEffect(() => {
    const media = window.matchMedia(systemQuery);
    function apply() {
      const applied =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = applied;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', applied === 'dark' ? '#131723' : '#f8f9fc');
    }
    apply();
    if (theme !== 'system') return;
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme(next) {
          localStorage.setItem(preferenceKey, next);
          window.dispatchEvent(new Event(changeEvent));
        },
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeSelect() {
  const { t } = useLanguage();
  const preference = useContext(ThemeContext);
  if (!preference) throw new Error('Theme preference is unavailable');
  return (
    <label>
      {t('Theme')}
      <select
        value={preference.theme}
        onChange={(event) => preference.setTheme(event.target.value as Theme)}
      >
        {Object.entries(choices).map(([key, label]) => (
          <option key={key} value={key}>
            {t(label)}
          </option>
        ))}
      </select>
    </label>
  );
}
