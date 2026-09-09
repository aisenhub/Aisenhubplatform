-- T16-R1 follow-up: the origin management wrapper needs the same narrow
-- domain-owner policy as the other M2 platform tables.
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.platform_auth_origins'::regclass
      and polname = 'platform_auth_origins_domain_owner'
  ) then
    create policy platform_auth_origins_domain_owner on public.platform_auth_origins
      for all to domain_owner using (true) with check (true);
  end if;
end;
$$;
