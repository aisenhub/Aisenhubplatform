begin;

select plan(3);

select ok((select confdeltype = 'c'
  from pg_constraint
  where conrelid = 'private.identity_lifecycle'::regclass
    and conname = 'identity_lifecycle_user_id_fkey'), 'identity deletion barrier cascades only after Auth deletion');
select ok(pg_get_constraintdef((select oid from pg_constraint where conrelid = 'private.identity_lifecycle'::regclass and conname = 'identity_lifecycle_user_id_fkey')) like '%ON DELETE CASCADE%', 'identity lifecycle FK is cascade');
select ok(pg_get_functiondef('private.identity_is_blocked(uuid)'::regprocedure) like '%identity_lifecycle%', 'identity block check remains the domain gate');

select * from finish();

rollback;
