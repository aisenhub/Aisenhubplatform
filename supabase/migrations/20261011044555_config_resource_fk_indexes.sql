-- OPT-007 Phase 01: covering indexes for Config-resource foreign keys.
-- These keep deletion/review/account lookups bounded without changing domain semantics.

create index platform_configs_current_version_fk_idx
  on public.platform_configs(id, current_version_id)
  where current_version_id is not null;

create index platform_config_versions_owner_config_fk_idx
  on public.platform_config_versions(platform_id, platform_account_id, config_id);

create index platform_config_versions_owner_file_fk_idx
  on public.platform_config_versions(platform_id, platform_account_id, file_id);

create index platform_config_gallery_submissions_config_fk_idx
  on public.platform_config_gallery_submissions(platform_id, config_id);

create index platform_config_gallery_submissions_version_fk_idx
  on public.platform_config_gallery_submissions(platform_id, config_id, version_id);

create index platform_config_gallery_submissions_submitter_fk_idx
  on public.platform_config_gallery_submissions(platform_id, submitted_by_account_id);

create index platform_config_gallery_submissions_reviewer_fk_idx
  on public.platform_config_gallery_submissions(reviewed_by)
  where reviewed_by is not null;

create index platform_config_gallery_entries_version_fk_idx
  on public.platform_config_gallery_entries(platform_id, config_id, published_version_id);

create index platform_config_gallery_entries_submission_fk_idx
  on public.platform_config_gallery_entries(platform_id, approved_submission_id);

create index platform_config_gallery_entries_approver_fk_idx
  on public.platform_config_gallery_entries(approved_by)
  where approved_by is not null;

create index platform_config_likes_account_fk_idx
  on public.platform_config_likes(platform_id, platform_account_id);

create index platform_config_usage_events_version_fk_idx
  on public.platform_config_usage_events(platform_id, config_id, version_id);

create index platform_config_usage_events_actor_fk_idx
  on public.platform_config_usage_events(platform_id, actor_platform_account_id)
  where actor_platform_account_id is not null;
