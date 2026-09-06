import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { adminI18n } from '@/i18n';

export const metadata: Metadata = {
  title: adminI18n.t('app.title'),
  description: adminI18n.t('app.description'),
  icons: {
    icon: '/moda-interact-favicon.png',
    apple: '/moda-interact-favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={adminI18n.locale} dir={adminI18n.direction}>
      <body>{children}</body>
    </html>
  );
}
