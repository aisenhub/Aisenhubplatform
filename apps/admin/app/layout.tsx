import type { Metadata } from 'next';

import { AdminAppearanceProvider } from '../components/appearance/admin-appearance';
import { AdminAppearanceInitScript } from '../components/appearance/admin-appearance-script';
import { AdminToaster } from '../components/appearance/admin-toaster';

import './globals.css';

export const metadata: Metadata = {
  title: 'Aisenhub Admin',
  description: 'Admin-only account platform shell',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      data-theme="light"
      data-theme-mode="system"
      data-accent="blue"
      data-surface="neutral"
    >
      <head>
        <AdminAppearanceInitScript />
      </head>
      <body>
        <AdminAppearanceProvider>
          {children}
          <AdminToaster />
        </AdminAppearanceProvider>
      </body>
    </html>
  );
}
