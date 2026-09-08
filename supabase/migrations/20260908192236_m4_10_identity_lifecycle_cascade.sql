alter table private.identity_lifecycle
  drop constraint identity_lifecycle_user_id_fkey;
alter table private.identity_lifecycle
  add constraint identity_lifecycle_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;
