-- TeamLite - setup completo
-- Rode tudo no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  username text primary key references public.users(username) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contact_requests (
  id bigserial primary key,
  sender_username text not null references public.users(username) on delete cascade,
  receiver_username text not null references public.users(username) on delete cascade,
  pair_key text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists contact_requests_pair_key_idx on public.contact_requests(pair_key);
create index if not exists contact_requests_sender_idx on public.contact_requests(sender_username);
create index if not exists contact_requests_receiver_idx on public.contact_requests(receiver_username);

create table if not exists public.contacts (
  id bigserial primary key,
  user_low text not null references public.users(username) on delete cascade,
  user_high text not null references public.users(username) on delete cascade,
  pair_key text not null unique,
  created_at timestamptz not null default now(),
  check (user_low <> user_high)
);

create index if not exists contacts_user_low_idx on public.contacts(user_low);
create index if not exists contacts_user_high_idx on public.contacts(user_high);

create table if not exists public.conversations (
  id bigserial primary key,
  kind text not null check (kind in ('direct', 'group')),
  title text,
  direct_key text unique,
  created_by text references public.users(username) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_kind_idx on public.conversations(kind);
create index if not exists conversations_updated_at_idx on public.conversations(updated_at desc);

create table if not exists public.conversation_members (
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  username text not null references public.users(username) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, username)
);

create index if not exists conversation_members_username_idx on public.conversation_members(username);

create table if not exists public.messages (
  id bigserial primary key,
  conversation_id bigint not null references public.conversations(id) on delete cascade,
  sender_username text not null references public.users(username) on delete cascade,
  content text,
  image_url text,
  created_at timestamptz not null default now(),
  check ((content is not null and btrim(content) <> '') or image_url is not null)
);

create index if not exists messages_conversation_id_idx on public.messages(conversation_id);
create index if not exists messages_created_at_idx on public.messages(created_at);

create table if not exists public.online_users (
  username text primary key references public.users(username) on delete cascade,
  last_seen timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
before update on public.conversations
for each row
execute function public.set_updated_at();

create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.conversations
     set updated_at = now()
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation_on_message on public.messages;
create trigger trg_touch_conversation_on_message
after insert on public.messages
for each row
execute function public.touch_conversation_on_message();

create or replace function public.create_profile_after_user_insert()
returns trigger
language plpgsql
as $$
begin
  insert into public.user_profiles (username, display_name)
  values (new.username, new.username)
  on conflict (username) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_profile_after_user_insert on public.users;
create trigger trg_create_profile_after_user_insert
after insert on public.users
for each row
execute function public.create_profile_after_user_insert();

alter table public.users enable row level security;
alter table public.user_profiles enable row level security;
alter table public.contact_requests enable row level security;
alter table public.contacts enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.online_users enable row level security;

-- Como o frontend não acessa o banco direto, as policies abaixo só evitam erro com anon.
-- O backend usa SERVICE ROLE.

drop policy if exists "public read users" on public.users;
create policy "public read users"
on public.users
for select
to anon
using (true);

drop policy if exists "public read profiles" on public.user_profiles;
create policy "public read profiles"
on public.user_profiles
for select
to anon
using (true);

drop policy if exists "public read contact_requests" on public.contact_requests;
create policy "public read contact_requests"
on public.contact_requests
for select
to anon
using (true);

drop policy if exists "public read contacts" on public.contacts;
create policy "public read contacts"
on public.contacts
for select
to anon
using (true);

drop policy if exists "public read conversations" on public.conversations;
create policy "public read conversations"
on public.conversations
for select
to anon
using (true);

drop policy if exists "public read conversation_members" on public.conversation_members;
create policy "public read conversation_members"
on public.conversation_members
for select
to anon
using (true);

drop policy if exists "public read messages" on public.messages;
create policy "public read messages"
on public.messages
for select
to anon
using (true);

drop policy if exists "public read online_users" on public.online_users;
create policy "public read online_users"
on public.online_users
for select
to anon
using (true);

insert into public.users (username, password, is_admin)
values
  ('admin', 'admin123', true),
  ('jean', '123456', false),
  ('teste', '123456', false)
on conflict (username) do nothing;
