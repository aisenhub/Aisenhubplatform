import type { ComponentProps, ReactNode } from 'react';

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type AdminWorkspaceSectionProps = Omit<ComponentProps<'section'>, 'title'> & {
  title: string;
  titleId: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  bodyClassName?: string;
};

export function AdminWorkspaceSection({
  title,
  titleId,
  description,
  actions,
  meta,
  bodyClassName,
  className,
  children,
  ...props
}: AdminWorkspaceSectionProps) {
  return (
    <section
      className={joinClasses('admin-workspace-section', className)}
      aria-labelledby={props['aria-labelledby'] ?? titleId}
      {...props}
    >
      <div className="admin-workspace-section-heading">
        <div className="min-w-0">
          <h2 id={titleId}>{title}</h2>
          {description ? (
            <p className="admin-workspace-section-description">{description}</p>
          ) : null}
        </div>
        {meta || actions ? (
          <div className="admin-workspace-section-aside">
            {meta ? (
              <div className="admin-workspace-section-meta">{meta}</div>
            ) : null}
            {actions ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div
        className={joinClasses('admin-workspace-section-body', bodyClassName)}
      >
        {children}
      </div>
    </section>
  );
}

export function AdminTaskToolbar({
  className,
  ...props
}: ComponentProps<'section'>) {
  return (
    <section
      className={joinClasses('admin-task-toolbar', className)}
      {...props}
    />
  );
}
