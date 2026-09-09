import type { Metadata } from 'next';
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
      <body>{children}</body>
    </html>
  );
}
