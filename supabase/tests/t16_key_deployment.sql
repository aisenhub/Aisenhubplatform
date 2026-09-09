begin;

select plan(7);

select has_function(
  'private',
  'admin_platform_key_confirm_deployment',
  array['private.admin_context', 'uuid', 'uuid'],
  'Admin key deployment confirmation exists'
);
select has_function(
  'private',
  'admin_platform_key_list_v2',
  array['private.admin_context', 'uuid'],
  'Admin key list exposes deployment state'
);
select ok(
  has_function_privilege(
    'admin_executor',
    'private.admin_platform_key_confirm_deployment(private.admin_context, uuid, uuid)',
    'execute'
  ),
  'admin executor can confirm key deployment'
);
select ok(
  not has_function_privilege(
    'account_executor',
    'private.admin_platform_key_confirm_deployment(private.admin_context, uuid, uuid)',
    'execute'
  ),
  'account executor cannot confirm key deployment'
);
select has_column(
  'private',
  'platform_api_keys',
  'deployment_confirmed_at',
  'key table records deployment confirmation time'
);
select has_column(
  'private',
  'platform_api_keys',
  'deployment_confirmed_by',
  'key table records confirming administrator'
);
select ok(
  not has_table_privilege('account_executor', 'private.platform_api_keys', 'update'),
  'account executor cannot update key deployment state directly'
);

select * from finish();

rollback;
