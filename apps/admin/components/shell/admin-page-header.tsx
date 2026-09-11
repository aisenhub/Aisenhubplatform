type AdminPageHeaderProps = {
  title: string;
  description: string;
  actions?: React.ReactNode;
};

export function AdminPageHeader({
  title,
  description,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header
      className="admin-page-header flex flex-col border-b sm:flex-row sm:items-end sm:justify-between"
      data-test="admin-page-header"
    >
      <div className="admin-page-header-copy min-w-0 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="max-w-2xl">{description}</p>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
