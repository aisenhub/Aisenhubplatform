-- T15: optimistic Profile/Preferences updates and public Plan read boundary.

create or replace function private.profile_get(
  p_ctx private.account_context
)
returns table (
  display_name text,
  avatar_url text,
  bio text,
  locale text,
  timezone text,
  metadata jsonb,
  row_version bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
begin
  select principal.authorization, principal.platform_account_id into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then raise exception using errcode = '42501', message = v_authorization; end if;
  return query
    select p.display_name, p.avatar_url, p.bio, p.locale, p.timezone, p.metadata, p.row_version
    from public.platform_profiles p where p.platform_account_id = v_account_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.profile_patch(
  p_ctx private.account_context,
  p_expected_version bigint,
  p_patch jsonb
)
returns table (
  display_name text,
  avatar_url text,
  bio text,
  locale text,
  timezone text,
  metadata jsonb,
  row_version bigint
)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_profile public.platform_profiles;
begin
  if p_expected_version is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  if octet_length(p_patch::text) > 65536 then raise exception using errcode = '54000', message = 'payload_too_large'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) key where key not in ('display_name', 'avatar_url', 'bio', 'locale', 'timezone', 'metadata')) then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  if p_patch ? 'metadata' and jsonb_typeof(p_patch->'metadata') <> 'object' and p_patch->'metadata' <> 'null'::jsonb then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  select principal.authorization, principal.platform_account_id into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then raise exception using errcode = '42501', message = v_authorization; end if;
  select * into v_profile from public.platform_profiles where platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if v_profile.row_version <> p_expected_version then raise exception using errcode = '40001', message = 'precondition_failed'; end if;
  update public.platform_profiles p
  set display_name = case when p_patch ? 'display_name' then p_patch->>'display_name' else p.display_name end,
      avatar_url = case when p_patch ? 'avatar_url' then p_patch->>'avatar_url' else p.avatar_url end,
      bio = case when p_patch ? 'bio' then p_patch->>'bio' else p.bio end,
      locale = case when p_patch ? 'locale' then p_patch->>'locale' else p.locale end,
      timezone = case when p_patch ? 'timezone' then p_patch->>'timezone' else p.timezone end,
      metadata = case when p_patch ? 'metadata' then p_patch->'metadata' else p.metadata end,
      row_version = p.row_version + 1
  where p.platform_account_id = v_account_id and p.row_version = p_expected_version
  returning p.display_name, p.avatar_url, p.bio, p.locale, p.timezone, p.metadata, p.row_version
    into display_name, avatar_url, bio, locale, timezone, metadata, row_version;
  if not found then raise exception using errcode = '40001', message = 'precondition_failed'; end if;
  return next;
end;
$$;

create or replace function private.preferences_get(
  p_ctx private.account_context
)
returns table (preferences jsonb, row_version bigint)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
begin
  select principal.authorization, principal.platform_account_id into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then raise exception using errcode = '42501', message = v_authorization; end if;
  return query select pref.preferences, pref.row_version from public.platform_preferences pref where pref.platform_account_id = v_account_id;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
end;
$$;

create or replace function private.preferences_patch(
  p_ctx private.account_context,
  p_expected_version bigint,
  p_patch jsonb
)
returns table (preferences jsonb, row_version bigint)
language plpgsql
security definer
set search_path = pg_catalog, private, public
as $$
declare
  v_authorization text;
  v_account_id uuid;
  v_preferences jsonb;
  v_key text;
  v_value jsonb;
begin
  if p_expected_version is null or p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception using errcode = '22023', message = 'invalid_input'; end if;
  if octet_length(p_patch::text) > 65536 then raise exception using errcode = '54000', message = 'payload_too_large'; end if;
  select principal.authorization, principal.platform_account_id into v_authorization, v_account_id
  from private.account_principal(p_ctx) principal;
  if v_authorization <> 'allowed' then raise exception using errcode = '42501', message = v_authorization; end if;
  select pref.preferences into v_preferences from public.platform_preferences pref where pref.platform_account_id = v_account_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'resource_not_found'; end if;
  if (select pref.row_version from public.platform_preferences pref where pref.platform_account_id = v_account_id) <> p_expected_version then raise exception using errcode = '40001', message = 'precondition_failed'; end if;
  for v_key, v_value in select key, value from jsonb_each(p_patch) loop
    if v_value = 'null'::jsonb then v_preferences := v_preferences - v_key;
    else v_preferences := jsonb_set(v_preferences, array[v_key], v_value, true);
    end if;
  end loop;
  update public.platform_preferences pref set preferences = v_preferences, row_version = pref.row_version + 1
  where pref.platform_account_id = v_account_id and pref.row_version = p_expected_version
  returning pref.preferences, pref.row_version into preferences, row_version;
  if not found then raise exception using errcode = '40001', message = 'precondition_failed'; end if;
  return next;
end;
$$;

create or replace function private.public_plans_list(
  p_platform_id uuid,
  p_platform_key_id uuid
)
returns table (plan_id uuid, code text, name text, description text, kind text, features jsonb)
language plpgsql
stable
security definer
set search_path = pg_catalog, private, public
as $$
begin
  if not exists (
    select 1 from private.platform_api_keys k join public.platforms p on p.id = k.platform_id
    where k.id = p_platform_key_id and k.platform_id = p_platform_id and k.status = 'active'
      and (k.expires_at is null or k.expires_at > now()) and p.status = 'active'
  ) then raise exception using errcode = '28000', message = 'platform_key_invalid'; end if;
  return query select p.id, p.code, p.name, p.description, p.kind, p.features
    from public.plans p where p.platform_id = p_platform_id and p.status = 'active' order by p.code;
end;
$$;

alter function private.profile_get(private.account_context) owner to domain_owner;
alter function private.profile_patch(private.account_context, bigint, jsonb) owner to domain_owner;
alter function private.preferences_get(private.account_context) owner to domain_owner;
alter function private.preferences_patch(private.account_context, bigint, jsonb) owner to domain_owner;
alter function private.public_plans_list(uuid, uuid) owner to domain_owner;

create policy plans_domain_owner on public.plans
  for all to domain_owner using (true) with check (true);
grant select on public.platform_profiles, public.platform_preferences, public.plans to domain_owner;
grant execute on function private.profile_get(private.account_context) to account_executor;
grant execute on function private.profile_patch(private.account_context, bigint, jsonb) to account_executor;
grant execute on function private.preferences_get(private.account_context) to account_executor;
grant execute on function private.preferences_patch(private.account_context, bigint, jsonb) to account_executor;
grant execute on function private.public_plans_list(uuid, uuid) to account_executor;
