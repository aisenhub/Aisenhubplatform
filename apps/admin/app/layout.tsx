import type { Metadata } from 'next';

import { Toaster } from '@kit/ui/sonner';

import './globals.css';

export const metadata: Metadata = {
  title: 'Aisenhub Admin',
  description: 'Admin-only account platform shell',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
