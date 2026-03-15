
-- Avatar bucket
insert into storage.buckets (id,name,public)
values ('avatars','avatars',true);

create table if not exists profiles(
  id uuid primary key references users(id) on delete cascade,
  avatar_url text,
  updated_at timestamptz default now()
);

create or replace function update_profile_timestamp()
returns trigger as $$
begin
 new.updated_at=now();
 return new;
end;
$$ language plpgsql;

drop trigger if exists profile_update_trigger on profiles;
create trigger profile_update_trigger
before update on profiles
for each row execute procedure update_profile_timestamp();
