import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aisenhub · 配置工作区',
  description: '管理账户、配置文件和订阅方案的个人工作区',
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
