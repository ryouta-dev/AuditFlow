import type { Metadata, Viewport } from 'next';
import { pagesPath } from '@/lib/hosting';
import './globals.css';
import './dark.css';

export const metadata: Metadata = {
  title: 'AuditFlow | Рабочее пространство для проверок',
  description:
    'Создавайте чек-листы, проводите проверки онлайн и офлайн и отслеживайте устранение замечаний.',
  manifest: `${pagesPath}/manifest.webmanifest`,
  icons: { icon: `${pagesPath}/icon.svg`, apple: `${pagesPath}/icon-192.png` },
};
export const viewport: Viewport = { themeColor: '#f8f9fc' };

const initialTheme = `(() => {
  let preference;
  try { preference = localStorage.getItem('auditflow:theme'); } catch {}
  document.documentElement.dataset.theme = preference === 'light' || preference === 'dark'
    ? preference : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
})();`;

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initialTheme }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
