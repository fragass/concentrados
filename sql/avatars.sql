
insert into storage.buckets (id,name,public)
values ('avatars','avatars',true);

create table if not exists profiles(
 id uuid primary key,
 avatar_url text,
 updated_at timestamptz default now()
);
