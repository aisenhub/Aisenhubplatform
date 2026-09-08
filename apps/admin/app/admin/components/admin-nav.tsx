const links = [
  ['总览', '/admin'],
  ['平台与账户', '/admin/platforms'],
  ['计划与批次', '/admin/entitlements'],
  ['订阅', '/admin/subscriptions'],
  ['文件', '/admin/files'],
  ['删除任务', '/admin/deletion-jobs'],
  ['审计', '/admin/audit'],
] as const;

export function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin resources">
      {links.map(([label, href]) => (
        <a key={href} href={href}>
          {label}
        </a>
      ))}
    </nav>
  );
}
