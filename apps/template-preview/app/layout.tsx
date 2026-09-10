import type { Metadata } from 'next';
import './globals.css';

import { ConsumerFooter } from '../components/consumer-shell';

export const metadata: Metadata = {
  title: 'Aisenhub Template Preview',
  description: 'Minimal consumer integration shell',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <ConsumerFooter />
      </body>
    </html>
  );
}
