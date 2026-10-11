-- OPT-008 Phase 02: bind Feedback attachment content routes to their parent Feedback.

create or replace function private.feedback_attachment_upload_state(
  p_ctx private.account_context,
  p_feedback_id uuid,
  p_attachment_id uuid
)
returns table (
  attachment_id uuid, feedback_id uuid, platform_account_id uuid,
  status text, write_outcome text, requested_size_bytes bigint, actual_size_bytes bigint,
  sha256 text, storage_path text, mime_type text, uploaded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare v_account_id uuid;
begin
  if p_feedback_id is null or p_attachment_id is null then
    raise exception using errcode = '22023', message = 'invalid_input';
  end if;
  v_account_id := private.feedback_account_id(p_ctx, false);
  return query
  select a.id, a.feedback_id, a.platform_account_id, a.status, a.write_outcome,
    a.requested_size_bytes, a.actual_size_bytes, a.sha256, a.storage_path, a.mime_type, a.uploaded_at
  from public.platform_feedback_attachments a
  join public.platform_feedback f on f.id = a.feedback_id
  where a.id = p_attachment_id and a.feedback_id = p_feedback_id
    and a.platform_id = (p_ctx).platform_id and a.platform_account_id = v_account_id
    and f.platform_id = (p_ctx).platform_id and f.platform_account_id = v_account_id
    and f.status = 'draft' and a.status not in ('deleting', 'deleted', 'expired', 'failed');
  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
end;
$$;

alter function private.feedback_attachment_upload_state(private.account_context, uuid, uuid) owner to domain_owner;
revoke all on function private.feedback_attachment_upload_state(private.account_context, uuid, uuid)
  from public, anon, authenticated, admin_executor, job_executor, recovery_executor;
grant execute on function private.feedback_attachment_upload_state(private.account_context, uuid, uuid)
  to account_executor;
