create index if not exists platform_account_admin_tags_created_by_idx
  on public.platform_account_admin_tags(created_by);

create index if not exists platform_account_admin_notes_created_by_idx
  on public.platform_account_admin_notes(created_by);

create index if not exists platform_account_governance_events_actor_admin_user_idx
  on public.platform_account_governance_events(actor_admin_user_id);
