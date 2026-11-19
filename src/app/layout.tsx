import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AuditFlow | Рабочее пространство для проверок',
  description:
    'Создавайте чек-листы, проводите проверки онлайн и офлайн и отслеживайте устранение замечаний.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};
export const viewport: Viewport = { themeColor: '#f8f9fc' };

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
