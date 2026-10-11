-- OPT-008 Phase 01: covering indexes for Feedback foreign keys.

create index feedback_attachment_write_attempts_platform_attachment_fk_idx
  on private.feedback_attachment_write_attempts(platform_id, attachment_id);

create index platform_feedback_user_fk_idx
  on public.platform_feedback(user_id)
  where user_id is not null;

create index platform_feedback_events_actor_user_fk_idx
  on public.platform_feedback_events(actor_user_id)
  where actor_user_id is not null;

create index platform_feedback_labels_platform_feedback_fk_idx
  on public.platform_feedback_labels(platform_id, feedback_id);
