import type { Metadata } from 'next';
import './globals.css';

import { ConsumerFooter } from '../components/consumer-shell';

export const metadata: Metadata = {
  title: 'Aisenhub Template Preview',
  description: '公开的跨平台页面参考模板与 API 接入示例',
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
